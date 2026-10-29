// render-transcript.mjs — M-U4 渲染 I 转写镜像（WbRender.cs 的 JS 独立转写，防循环论证双链）
// 输入 = golden/render.json 场景输入；重算三段（地形烘焙/道具烘焙/单位决策）→ 与黄金输出逐位对账。
// 本文件语义必须与 WbRender.cs 逐行对应（含 bail 契约、f64 bits、样式串、ops 顺序）——改 C# 必同步改这里。
// 跑法：node scripts/unity-migration/render-transcript.mjs（全绿退出 0）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// M-U7a：直调模式的 sprites 镜像（mrr* 家族——render2/3/4-transcript 已验证语义，同源复用先例同 save3→save2）
import { mrrDrawPerson, mrrDrawPersonFine, mrrDrawQuadFine, mrrDrawBoat, mrrDrawCaravan, mrrDrawSheep, mrrDrawWolf, mrrDrawSnowWolf, mrrDrawBear, mrrDrawDeer } from './render2-transcript.mjs';
import { mrrDrawDragon, mrrDrawPenguin, mrrDrawCamel, mrrDrawScorpion, mrrDrawSnake, mrrDrawSkeleton, mrrDrawDemon, mrrDrawAngel, mrrDrawPhoenix, mrrDrawEnt, mrrDrawLich, mrrDrawHydra, mrrDrawMage, mrrDrawTroll, mrrDrawOgre, mrrDrawWhiteWalker, mrrDrawVampire, mrrDrawKraken, mrrDrawSandworm, mrrDrawBasilisk } from './render3-transcript.mjs';
import { mrrDrawChicken, mrrDrawPig, mrrDrawRabbit, mrrDrawFox, mrrDrawFish, mrrDrawCrab, mrrDrawTurtle, mrrDrawShark } from './render4-transcript.mjs';
import { mrrDrawEmergentCreature, mrrDrawEmergentMonster } from './render4-transcript.mjs';
import { visCacheFor as visCacheFor6 } from './render6-transcript.mjs';   // M-U7c：涌现缓存生产镜像（WbEmergence.cs 语义同源）

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLD = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/render.json'), 'utf-8'));

// ---------------- 常量表（蓝本 constants.ts / types.ts / render.ts 机械镜像） ----------------
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const TERRAIN_RGB = [[31,62,107],[56,113,163],[222,203,141],[104,152,60],[72,116,50],[130,137,96],[122,122,126],[228,235,240],[235,90,30],[66,58,51],[172,210,228],[88,96,50]];
const WATER_TIER_RGB = [[106,194,182],[79,149,171],[56,113,163]];
const DEEP_TIER_RGB = [[43,87,133],[30,58,102]];
const SOFT_TERRAIN = [false,false,true,true,true,true,false,true,false,true,false,true];
// ANIMAL_LOD（render.ts L2131）：[body, dark, w, h]
const ANIMAL_LOD = {
  sheep:['#d4dde4','#575757',3,2], wolf:['#7a746b','#3a342c',3,2], snowwolf:['#d4dde4','#9aa8b4',3,2],
  bear:['#5e452c','#3a342c',4,3], deer:['#b08054','#6e4a2b',3,3], penguin:['#e8eef2','#2a3440',2,3],
  camel:['#d8b878','#b09050',4,3], scorpion:['#8a4a22','#5a2f14',3,2], snake:['#5f7a3e','#3f5528',3,1],
  dragon:['#9c2f26','#5f1b15',5,4], skeleton:['#e2ded2','#a8a294',2,3], demon:['#8a2f28','#4a1815',3,3],
  mage:['#e8d5c0','#9b59d0',2,3], troll:['#7a8a5a','#55613c',4,4], ogre:['#a08552','#6e5a36',4,4],
  whitewalker:['#bcd4de','#7d97a4',2,3], vampire:['#4a3a50','#2c2230',2,3], kraken:['#6a4a8a','#46305e',4,3],
  sandworm:['#c8ad6e','#a08a52',4,2], basilisk:['#6a8848','#46602e',4,3],
  chicken:['#f6f1e4','#b07a3a',2,2], pig:['#e8a8a0','#a86058',3,2], rabbit:['#b8b0a4','#6e685e',2,2],
  fox:['#d97b3c','#8a4a1c',3,2], fish:['#9fd4d8','#5a9aa8',2,1], crab:['#d94a3a','#8a2418',3,2],
  turtle:['#4a7a3a','#2e5424',3,2], shark:['#5a6a78','#2e3a46',4,2],
};
const QUAD_FINE = { wolf:'wolf', snowwolf:'snowwolf', sheep:'sheep', bear:'bear', deer:'deer' };
// RDEF：RACES 渲染域子集（key/sprite/maxAge/aquatic/flying/vis/dynTint）——41 族（types.ts RACES 机械镜像）
const RDEF = {
  0:{sprite:'person',maxAge:55,aquatic:false,flying:false,vis:false,dynTint:null},
  1:{sprite:'person',maxAge:90,aquatic:false,flying:false,vis:false,dynTint:null},
  2:{sprite:'person',maxAge:120,aquatic:false,flying:false,vis:false,dynTint:null},
  3:{sprite:'person',maxAge:48,aquatic:false,flying:false,vis:false,dynTint:null},
  4:{sprite:'person',maxAge:45,aquatic:false,flying:false,vis:false,dynTint:null},
  5:{sprite:'person',maxAge:9999,aquatic:false,flying:false,vis:false,dynTint:null},
  6:{sprite:'sheep',maxAge:26,aquatic:false,flying:false,vis:false,dynTint:null},
  7:{sprite:'wolf',maxAge:22,aquatic:false,flying:false,vis:false,dynTint:null},
  8:{sprite:'bear',maxAge:40,aquatic:false,flying:false,vis:false,dynTint:null},
  9:{sprite:'dragon',maxAge:9999,aquatic:false,flying:true,vis:false,dynTint:null},
  10:{sprite:'deer',maxAge:20,aquatic:false,flying:false,vis:false,dynTint:null},
  11:{sprite:'penguin',maxAge:18,aquatic:false,flying:false,vis:false,dynTint:null},
  12:{sprite:'camel',maxAge:35,aquatic:false,flying:false,vis:false,dynTint:null},
  13:{sprite:'scorpion',maxAge:16,aquatic:false,flying:false,vis:false,dynTint:null},
  14:{sprite:'snake',maxAge:20,aquatic:false,flying:false,vis:false,dynTint:null},
  15:{sprite:'snowwolf',maxAge:24,aquatic:false,flying:false,vis:false,dynTint:null},
  16:{sprite:'skeleton',maxAge:9999,aquatic:false,flying:false,vis:false,dynTint:null},
  17:{sprite:'demon',maxAge:9999,aquatic:false,flying:false,vis:false,dynTint:null},
  18:{sprite:'mage',maxAge:200,aquatic:false,flying:false,vis:false,dynTint:null},
  19:{sprite:'person',maxAge:70,aquatic:false,flying:false,vis:false,dynTint:null},
  20:{sprite:'person',maxAge:34,aquatic:false,flying:false,vis:false,dynTint:null},
  21:{sprite:'troll',maxAge:400,aquatic:false,flying:false,vis:false,dynTint:null},
  22:{sprite:'ogre',maxAge:120,aquatic:false,flying:false,vis:false,dynTint:null},
  23:{sprite:'whitewalker',maxAge:9999,aquatic:false,flying:false,vis:false,dynTint:null},
  24:{sprite:'vampire',maxAge:9999,aquatic:false,flying:false,vis:false,dynTint:null},
  25:{sprite:'kraken',maxAge:9999,aquatic:true,flying:false,vis:false,dynTint:null},
  26:{sprite:'sandworm',maxAge:9999,aquatic:false,flying:false,vis:false,dynTint:null},
  27:{sprite:'basilisk',maxAge:400,aquatic:false,flying:false,vis:false,dynTint:null},
  28:{sprite:'angel',maxAge:9999,aquatic:false,flying:true,vis:false,dynTint:null},
  29:{sprite:'phoenix',maxAge:9999,aquatic:false,flying:true,vis:false,dynTint:null},
  30:{sprite:'ent',maxAge:9999,aquatic:false,flying:false,vis:false,dynTint:null},
  31:{sprite:'lich',maxAge:9999,aquatic:false,flying:false,vis:false,dynTint:null},
  32:{sprite:'hydra',maxAge:9999,aquatic:false,flying:false,vis:false,dynTint:null},
  33:{sprite:'chicken',maxAge:14,aquatic:false,flying:false,vis:false,dynTint:null},
  34:{sprite:'pig',maxAge:22,aquatic:false,flying:false,vis:false,dynTint:null},
  35:{sprite:'rabbit',maxAge:12,aquatic:false,flying:false,vis:false,dynTint:null},
  36:{sprite:'fox',maxAge:18,aquatic:false,flying:false,vis:false,dynTint:null},
  37:{sprite:'fish',maxAge:10,aquatic:true,flying:false,vis:false,dynTint:null},
  38:{sprite:'crab',maxAge:16,aquatic:true,flying:false,vis:false,dynTint:null},
  39:{sprite:'turtle',maxAge:120,aquatic:true,flying:false,vis:false,dynTint:null},
  40:{sprite:'shark',maxAge:40,aquatic:true,flying:false,vis:false,dynTint:null},
};

// ---------------- JS 语义工具（与 C# WbMath/WbRender 工具对应） ----------------
function h2f(hex) {
  const b = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return b.getFloat64(0, true);
}
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
const imul32 = (a, b) => (Math.imul(a, b) >>> 0);
const u32 = (v) => (v >>> 0);
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const trunc = (v) => (v | 0); // JS |0 = 截断
const round = (v) => Math.round(v);

// ============================================================
// 段 1：地形烘焙（engine.ts flushDirty L14016-14297 机械转写）
// ============================================================
function natureTint(t, y, i, season, ash, glacier) {
  if (glacier > 80) {
    const a = Math.min(1, (glacier - 80) / 100);
    return [Math.round(38 + 8 * a), Math.round(40 + 9 * a), Math.round(52 + 16 * a)];
  }
  const s = season;
  if (s === 1 && ash < 0.05) return [0, 0, 0];
  const latF = Math.abs(y / 160 - 0.5) * 2;
  let r = 0, g = 0, b = 0;
  if (s === 0) {
    if (t === T.GRASS) { r = -6; g = 22; b = -8; }
    else if (t === T.FOREST) { r = -4; g = 18; b = -6; }
  } else if (s === 2) {
    const f = 0.35 + latF * 0.4;
    if (t === T.GRASS) { r = Math.round(38 * f); g = Math.round(14 * f); b = Math.round(-30 * f); }
    else if (t === T.FOREST) { r = Math.round(44 * f); g = Math.round(4 * f); b = Math.round(-36 * f); }
    else if (t === T.HILL) { r = Math.round(14 * f); g = Math.round(2 * f); b = Math.round(-12 * f); }
  } else if (s === 3) {
    const f = Math.max(0, latF - 0.22) * 1.25;
    if (t === T.GRASS) { r = Math.round(62 * f); g = Math.round(58 * f); b = Math.round(52 * f); }
    else if (t === T.FOREST) { r = Math.round(46 * f); g = Math.round(42 * f); b = Math.round(38 * f); }
    else if (t === T.HILL) { r = Math.round(40 * f); g = Math.round(38 * f); b = Math.round(34 * f); }
    else if (t === T.SAND) { r = Math.round(26 * f); g = Math.round(26 * f); b = Math.round(26 * f); }
  }
  if (ash > 0.05) {
    const a = Math.min(1, ash);
    r -= Math.round(26 * a); g -= Math.round(22 * a); b -= Math.round(14 * a);
    if (s === 1 && latF > 0.45) {
      const f = (latF - 0.45) * a * 1.8;
      r += Math.round(40 * f); g += Math.round(38 * f); b += Math.round(36 * f);
    }
  }
  return [r, g, b];
}
const isWaterT = (tt) => tt === T.WATER || tt === T.DEEP;

function terrainBake(inp) {
  const { t, variant, waterTier, road, owner, radiate, nL, nR, nT, nB, nTL, nBR, civColor, season, ash, glacier, i } = inp;
  const y = (i / 256) | 0, x = i % 256;
  let base;
  if (t === T.WATER) base = waterTier <= 2 ? (WATER_TIER_RGB[waterTier] ?? TERRAIN_RGB[1]) : TERRAIN_RGB[1];
  else if (t === T.DEEP) base = waterTier >= 3 ? DEEP_TIER_RGB[waterTier - 3] : TERRAIN_RGB[0];
  else base = TERRAIN_RGB[t] ?? TERRAIN_RGB[0];
  const v = (variant % 13) - 6;
  const tint = natureTint(t, y, i, season, h2f(ash), glacier);
  let r = base[0] + v + tint[0];
  let g = base[1] + v + tint[1];
  let b = base[2] + v + tint[2];
  if (SOFT_TERRAIN[t]) {
    let nb = -1;
    if (nL >= 0 && nL !== t && SOFT_TERRAIN[nL]) nb = nL;
    else if (nR >= 0 && nR !== t && SOFT_TERRAIN[nR]) nb = nR;
    else if (nT >= 0 && nT !== t && SOFT_TERRAIN[nT]) nb = nT;
    else if (nB >= 0 && nB !== t && SOFT_TERRAIN[nB]) nb = nB;
    if (nb >= 0 && ((variant + x + y) & 1) === 0) {
      const hardPair = (t === T.GRASS && (nb === T.SAND || nb === T.SNOW))
        || (t === T.SAND && nb === T.GRASS) || (t === T.SNOW && nb === T.GRASS);
      const a = hardPair ? 0.5 : 0.32;
      const bc = TERRAIN_RGB[nb];
      r = r * (1 - a) + bc[0] * a;
      g = g * (1 - a) + bc[1] * a;
      b = b * (1 - a) + bc[2] * a;
    }
  }
  if (t === T.HILL || t === T.MOUNTAIN) {
    const elev = (tt) => (tt === T.MOUNTAIN ? 2 : tt === T.HILL ? 1 : 0);
    let slope = 0;
    if (x > 0 && y > 0) slope += elev(nTL);
    if (x < 255 && y < 159) slope -= elev(nBR);
    if (slope > 0) { const k = Math.min(0.16, slope * 0.08); r *= 1 - k; g *= 1 - k; b *= 1 - k; }
    else if (slope < 0) { const k = Math.min(0.12, -slope * 0.06); r += 30 * k; g += 30 * k; b += 26 * k; }
  }
  if (road > 0) { r = r * 0.5 + 178 * 0.5; g = g * 0.5 + 156 * 0.5; b = b * 0.5 + 114 * 0.5; }
  if (owner >= 0 && civColor) {
    let border = false;
    if (nL >= 0 && inp.oL !== owner) border = true;
    else if (nR >= 0 && inp.oR !== owner) border = true;
    else if (nT >= 0 && inp.oT !== owner) border = true;
    else if (nB >= 0 && inp.oB !== owner) border = true;
    const a = border ? 0.45 : 0.22;
    r = r * (1 - a) + civColor[0] * a;
    g = g * (1 - a) + civColor[1] * a;
    b = b * (1 - a) + civColor[2] * a;
  }
  if (radiate > 0) { r = r * 0.6 + 100 * 0.4; g = g * 0.6 + 230 * 0.4; b = b * 0.6 + 90 * 0.4; }
  // 8×8 烘焙
  const px = new Uint8Array(256);
  const r0 = trunc(r), g0 = trunc(g), b0 = trunc(b);
  const hsh = u32(variant * 2654435761 + i * 97);
  const fineNoise = t === T.GRASS || t === T.FOREST || t === T.SAND;
  for (let sy = 0; sy < 8; sy++) {
    for (let sx = 0; sx < 8; sx++) {
      let pr = r0, pg = g0, pb = b0;
      if (fineNoise) {
        const nz = u32(hsh ^ imul32((sy << 3) | sx, 2246822519)) ;
        const nzz = ((nz >>> 10)) % 20;
        if (nzz < 3) { const d = (nzz & 1) === 0 ? 2 : -2; pr += d; pg += d; pb += d; }
      }
      const off = (sy * 8 + sx) * 4;
      px[off] = clamp8(pr); px[off + 1] = clamp8(pg); px[off + 2] = clamp8(pb); px[off + 3] = 255;
    }
  }
  const dot = (sx, sy, dr, dg, db, w = 1, h = 1) => {
    const x1 = Math.min(8, sx + w), y1 = Math.min(8, sy + h);
    for (let yy = Math.max(0, sy); yy < y1; yy++)
      for (let xx = Math.max(0, sx); xx < x1; xx++) {
        const off = (yy * 8 + xx) * 4;
        px[off] = clamp8(r0 + dr); px[off + 1] = clamp8(g0 + dg); px[off + 2] = clamp8(b0 + db);
      }
  };
  if (t === T.GRASS || t === T.FOREST) {
    const n = 1 + (hsh & 1);
    for (let k = 0; k < n; k++) {
      const sx = (hsh >>> (k * 3 + 2)) & 7;
      const sy = (hsh >>> (k * 3 + 5)) & 6;
      const lit = ((hsh >>> (k * 5)) & 1) === 1;
      const dr2 = lit ? 14 : -16;
      dot(sx, sy, dr2, trunc(dr2 * 1.4), trunc(dr2 * 0.4), 1, 2);
    }
    if (hsh % 37 === 0) {
      const fx = (hsh >>> 4) & 7, fy = (hsh >>> 9) & 7, kind = (hsh >>> 3) & 3;
      if (kind === 0) dot(fx, fy, 52, -20, 18, 1, 1);
      else if (kind === 1) dot(fx, fy, 58, 44, -24, 1, 1);
      else dot(fx, fy, 64, 62, 54, 1, 1);
      dot(Math.min(7, fx + 1), fy, -6, 10, -4, 1, 1);
    }
  } else if (t === T.SAND) {
    const rx = (hsh >>> 3) & 6, ry = (hsh >>> 6) & 7;
    dot(rx, ry, -12, -9, -4, 3, 1);
    if ((hsh & 1) === 0) dot((hsh >>> 9) & 6, (hsh >>> 12) & 7, -10, -7, -3, 2, 1);
    if ((hsh & 3) === 0) dot((hsh >>> 15) & 7, (hsh >>> 18) & 7, 15, 12, 5);
    const xL = x > 0 && isWaterT(nL), xR = x < 255 && isWaterT(nR);
    const yT = y > 0 && isWaterT(nT), yB = y < 159 && isWaterT(nB);
    if (xL) dot(0, 0, -22, -16, -6, 1, 8);
    if (xR) dot(7, 0, -22, -16, -6, 1, 8);
    if (yT) dot(0, 0, -22, -16, -6, 8, 1);
    if (yB) dot(0, 7, -22, -16, -6, 8, 1);
  } else if (t === T.WATER) {
    const wt = waterTier;
    if (wt <= 1 && (hsh & 3) === 0) dot((hsh >>> 4) & 6, (hsh >>> 7) & 7, 22, 30, 40, 2, 1);
    const landL = x > 0 && nL !== T.WATER && nL !== T.DEEP;
    const landR = x < 255 && nR !== T.WATER && nR !== T.DEEP;
    const landT = y > 0 && nT !== T.WATER && nT !== T.DEEP;
    const landB = y < 159 && nB !== T.WATER && nB !== T.DEEP;
    if (landL || landR || landT || landB) {
      const fo = 46, fg = 54, fb = 56;
      if (landL) { dot(0, (hsh >>> 5) & 6, fo, fg, fb, 1, 2); dot(0, ((hsh >>> 8) & 5) + 3, trunc(fo * 0.7), trunc(fg * 0.7), trunc(fb * 0.7), 1, 1); }
      if (landR) { dot(7, (hsh >>> 5) & 6, fo, fg, fb, 1, 2); dot(7, ((hsh >>> 8) & 5) + 3, trunc(fo * 0.7), trunc(fg * 0.7), trunc(fb * 0.7), 1, 1); }
      if (landT) { dot((hsh >>> 5) & 6, 0, fo, fg, fb, 2, 1); dot(((hsh >>> 8) & 5) + 3, 0, trunc(fo * 0.7), trunc(fg * 0.7), trunc(fb * 0.7), 1, 1); }
      if (landB) { dot((hsh >>> 5) & 6, 7, fo, fg, fb, 2, 1); dot(((hsh >>> 8) & 5) + 3, 7, trunc(fo * 0.7), trunc(fg * 0.7), trunc(fb * 0.7), 1, 1); }
    }
  } else if (t === T.SNOW) {
    if ((hsh & 1) === 0) dot((hsh >>> 3) & 7, (hsh >>> 6) & 7, 20, 20, 24);
    if ((hsh & 3) === 0) dot((hsh >>> 9) & 7, (hsh >>> 12) & 7, 14, 15, 20);
    if ((hsh & 7) === 0) dot((hsh >>> 15) & 6, (hsh >>> 18) & 7, -9, -8, -4, 2, 1);
  } else if (t === T.ICE) {
    if ((hsh & 3) === 0) {
      const cx = (hsh >>> 4) & 6, cy = (hsh >>> 7) & 6;
      dot(cx, cy, -16, -20, -18, 1, 2);
      dot(Math.min(7, cx + 1), cy + 2, -14, -18, -16, 2, 1);
    }
    if ((hsh & 1) === 0) dot((hsh >>> 10) & 7, (hsh >>> 13) & 7, 24, 28, 32);
  } else if (t === T.MOUNTAIN || t === T.HILL) {
    if (hsh % 9 < 5) { const cx = (hsh >>> 3) & 7, cy = (hsh >>> 6) & 5; dot(cx, cy, -20, -18, -16, 1, 3); }
    if ((hsh & 3) === 0) { const cx = (hsh >>> 3) & 7, cy = (hsh >>> 6) & 5; dot(Math.max(0, cx - 2), cy + 1, 15, 14, 12, 2, 2); }
    if ((hsh & 15) === 0) dot((hsh >>> 12) & 7, (hsh >>> 15) & 7, -30, -28, -26);
  } else if (t === T.LAVA) {
    const cx = (hsh >>> 3) & 5, cy = (hsh >>> 6) & 5;
    dot(cx, cy, -44, -28, -6, 3, 3);
    dot(cx + 3, cy, 56, 26, -8, 1, 2);
    dot(cx, cy + 3, 50, 22, -8, 2, 1);
  } else if (t === T.SWAMP) {
    if ((hsh & 3) !== 3) {
      const mx = (hsh >>> 3) & 5, my = (hsh >>> 6) & 5;
      dot(mx, my, -14, -10, -8, 3, 2);
      if ((hsh & 1) === 0) dot((hsh >>> 9) & 6, (hsh >>> 12) & 6, 10, 8, -6, 2, 1);
    }
    const reeds = hsh % 9 < 4 ? 1 + ((hsh >>> 20) & 1) : 0;
    for (let k = 0; k < reeds; k++) {
      const rx = (hsh >>> (k * 4 + 2)) & 7, ry = (hsh >>> (k * 4 + 6)) & 5;
      const lit = ((hsh >>> (k * 7)) & 1) === 1;
      dot(rx, ry, lit ? -26 : -40, lit ? -22 : -32, lit ? -6 : -12, 1, 3);
    }
    if (hsh % 16 === 0) dot((hsh >>> 14) & 7, (hsh >>> 18) & 7, -6, -20, -10);
    const xLw = x > 0 && isWaterT(nL), xRw = x < 255 && isWaterT(nR);
    const yTw = y > 0 && isWaterT(nT), yBw = y < 159 && isWaterT(nB);
    if (xLw || xRw || yTw || yBw) {
      if (xLw) dot(0, 0, -20, -14, -10, 1, 8);
      if (xRw) dot(7, 0, -20, -14, -10, 1, 8);
      if (yTw) dot(0, 0, -20, -14, -10, 8, 1);
      if (yBw) dot(0, 7, -20, -14, -10, 8, 1);
    }
  } else if (t === T.BURNT) {
    dot((hsh >>> 4) & 7, (hsh >>> 6) & 7, -12, -10, -6, 2, 1);
    if ((hsh & 3) === 0) dot((hsh >>> 9) & 7, (hsh >>> 11) & 7, 30, 10, -6);
  }
  let hex = '';
  for (let k = 0; k < 256; k++) hex += px[k].toString(16).padStart(2, '0');
  return hex;
}

// ============================================================
// 段 2：道具烘焙（engine.ts flushProps L14299-14440 机械转写）
// ============================================================
class DrawList {
  constructor() { this.ops = []; this.bails = []; }
  fill(style, x, y, w, h) { this.ops.push({ o: 'fillRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: [style] }); }
  clear(x, y, w, h) { this.ops.push({ o: 'clearRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: null }); }
  stroke(style, lw, x, y, w, h) { this.ops.push({ o: 'strokeRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: [style, lw] }); }
  bail(fn, a) { this.bails.push({ fn, a }); }
  // —— M-U7a：mrr* C# 风格适配层（WbDrawList 等价面；a 一律 f64hex，fillRect s=[style]，strokeRect s=[style, lw 数字]）——
  Fill(style, x, y, w, h) { this.fill(style, x, y, w, h); }
  Stroke(style, lw, x, y, w, h) { this.stroke(style, typeof lw === 'number' ? lw : h2f(lw), x, y, w, h); }
  Tag(o, ...a) { this.ops.push({ o, a: a.map((v) => (typeof v === 'number' ? f64hex(v) : v)), s: null }); }
}
function propsBake(inp) {
  const { i, t, variant, road, snowman, season } = inp;
  const x = i % 256, y = (i / 256) | 0;
  const L = new DrawList();
  L.clear(x * 4 - 2, y * 4 - 3, 9, 10);
  if (t === T.FOREST) {
    L.bail('drawTree', [f64hex(x), f64hex(y), f64hex(variant), f64hex(season)]);
  } else if (t === T.MOUNTAIN) {
    const polar = Math.abs(y / 160 - 0.5) * 2;
    const cold = Math.min(1, polar * 1.1 + (season === 3 ? 0.25 : season === 1 ? -0.1 : 0.05));
    L.bail('drawMountainProp', [f64hex(x), f64hex(y), f64hex(variant), f64hex(150 + (variant % 50)), f64hex(cold)]);
  } else if (road > 0) {
    const h = u32(variant * 2654435761);
    if (h % 3 === 0) {
      L.fill('rgba(120,102,74,0.85)', x * 4 + (h & 1), y * 4 + ((h >> 1) & 1), 1, 1);
      if (h % 6 === 0) L.fill('rgba(160,142,110,0.8)', x * 4 + 1 - (h & 1), y * 4 + 1 - ((h >> 1) & 1), 1, 1);
    }
  } else if (t === T.GRASS) {
    const h = u32(variant * 2654435761 + i * 40503);
    const m = h % 31;
    if (m < 3) {
      const FLOWER = ['#e5696d', '#ffd93d', '#f2ead8', '#c793e8'];
      L.fill(FLOWER[(h >> 5) & 3], x * 4 + (h & 1), y * 4 + ((h >> 3) & 1), 1, 1);
    } else if (m < 10) {
      L.fill('rgba(44,84,28,0.6)', x * 4 + (h & 1), y * 4, 1, 2);
      L.fill('rgba(70,120,44,0.55)', x * 4 + 1 - (h & 1), y * 4 + ((h >> 2) & 1), 1, 1);
    } else if (m === 10) {
      L.fill('rgba(148,144,136,0.8)', x * 4 + (h & 1), y * 4 + ((h >> 4) & 1), 1, 1);
    }
  } else if (t === T.SAND) {
    const h = u32(variant * 2654435761 + i * 9127);
    if (h % 13 === 0) {
      L.fill('rgba(238,222,168,0.55)', x * 4, y * 4 + (h & 1), 2, 1);
      L.fill('rgba(214,192,140,0.5)', x * 4 + (h & 1), y * 4 + 1 - (h & 1), 1, 1);
    } else if (h % 37 === 0) {
      L.fill('rgba(178,158,120,0.7)', x * 4 + (h & 1), y * 4 + ((h >> 3) & 1), 1, 1);
    }
  } else if (t === T.HILL) {
    const h = u32(variant * 2654435761 + i * 7907);
    if (h % 17 === 0) L.fill('rgba(96,104,54,0.6)', x * 4 + (h & 1), y * 4, 1, 2);
    else if (h % 41 === 0) L.fill('rgba(118,116,110,0.7)', x * 4 + (h & 1), y * 4 + ((h >> 2) & 1), 1, 1);
  } else if (t === T.SNOW) {
    const h = u32(variant * 2654435761 + i * 1543);
    if (h % 19 === 0) L.fill('rgba(222,240,252,0.85)', x * 4 + (h & 1), y * 4 + ((h >> 3) & 1), 1, 1);
  } else if (t === T.BURNT) {
    const h = u32(variant * 2654435761 + i * 3571);
    if (h % 11 === 0) {
      L.fill('rgba(28,22,18,0.7)', x * 4 + (h & 1), y * 4 + ((h >> 2) & 1), 1, 1);
      L.fill('rgba(28,22,18,0.7)', x * 4 + (h & 1), y * 4 + 1 - ((h >> 2) & 1), 1, 1);
    }
  }
  if (snowman) {
    const px = x * 4, py = y * 4;
    L.fill('rgba(52,70,92,0.42)', px, py + 1, 1, 3);
    L.fill('rgba(52,70,92,0.42)', px + 3, py + 1, 1, 3);
    L.fill('rgba(52,70,92,0.42)', px + 1, py - 1, 2, 1);
    L.fill('rgba(52,70,92,0.42)', px + 1, py + 4, 2, 1);
    L.fill('rgba(96,74,50,0.9)', px, py + 2, 1, 1);
    L.fill('rgba(96,74,50,0.9)', px + 3, py + 2, 1, 1);
    L.fill('#dbe9f4', px + 1, py + 2, 2, 2);
    L.fill('rgba(150,180,205,0.65)', px + 1, py + 3, 2, 1);
    L.fill('#f4f9fd', px + 1, py, 2, 2);
    L.fill('#3a3226', px + 1, py, 1, 1);
    L.fill('#e08a3c', px + 2, py + 1, 1, 1);
  }
  return L;
}

// ============================================================
// 段 3：单位绘制决策（render.ts render 单位循环 + drawUnitSprite/drawUnitBody 机械转写）
// ============================================================
const W2 = 1024, H2 = 640; // 用户空间（wc.setTransform(2,0,0,2,0,0) 基变换；render.ts L1255）
let lastWcClear = null;       // render.ts L885 模块态（场景序确定 → 确定）
let sunCacheFrame = -1;       // render.ts L22 帧缓存
const sunScratch = { level: 1, sx: 1, sy: 0.45, len: 0.6 };
let sunUnitShadowStyle = 'rgba(12,9,6,0.24)';

function sunState(p) {
  const DAY = 0.40, DUSK = 0.52, NIGHT_END = 0.88;
  let level, sx, sy;
  if (p < DAY) {
    const t = p / DAY;
    level = 0.35 + 0.65 * Math.sin(t * Math.PI);
    sx = -Math.cos(t * Math.PI);
    sy = 0.45;
  } else if (p < DUSK) {
    const t = (p - DAY) / (DUSK - DAY);
    level = 0.35 * (1 - t) + 0.18 * t;
    sx = 1; sy = 0.4;
  } else if (p < NIGHT_END) {
    level = 0.16 + 0.05 * Math.sin((p - DUSK) * Math.PI / (NIGHT_END - DUSK));
    sx = 1; sy = 0.3;
  } else {
    const t = (p - NIGHT_END) / (1 - NIGHT_END);
    level = 0.18 + (0.35 - 0.18) * t;
    sx = 1 * (1 - t) + (-1) * t;
    sy = 0.4;
  }
  const len = 0.6 + 2.2 * (1 - level);
  return { level, sx, sy, len };
}
// 动态种族 def 宿主协议（M-U7c）：RDEF 基表 41 静态族；种化/读档动态种由驱动端 setDynRdef 注入（蓝本 RACES 单一注册表的分体等价）
const DYN_RDEF = new Map();
export function setDynRdef(m) {
  DYN_RDEF.clear();
  if (m) for (const k of Object.keys(m)) DYN_RDEF.set(Number(k), m[k]);
}

function sunCached(frameCount) {
  if (sunCacheFrame !== frameCount) {
    const p = (frameCount % 2400) / 2400;
    const s = sunState(p);
    sunScratch.level = s.level; sunScratch.sx = s.sx; sunScratch.sy = s.sy; sunScratch.len = s.len;
    sunUnitShadowStyle = `rgba(12,9,6,${(0.15 + 0.09 * (1 - s.level)).toFixed(3)})`;
    sunCacheFrame = frameCount;
  }
  return sunScratch;
}
function drawCrown(L, cx, baseY) {
  L.fill('#e6ba6c', cx - 1, baseY, 3, 1);
  L.fill('#e6ba6c', cx - 1, baseY - 1, 1, 1);
  L.fill('#e6ba6c', cx + 1, baseY - 1, 1, 1);
  L.fill('#ffe9a8', cx, baseY - 1, 1, 1);
}

function unitScene(inp, direct = false) {
  const cam = { x: h2f(inp.cam.x), y: h2f(inp.cam.y), zoom: h2f(inp.cam.zoom) };
  const fc = inp.frameCount, cw = inp.cw, ch = inp.ch;
  const L = new DrawList();
  // —— 视口与清屏机（render L1246/L1259：lastWcClear 模块态跨场景延续） ——
  const halfW = cw / cam.zoom / 2 + 3, halfH = ch / cam.zoom / 2 + 3;
  const x0 = cam.x - halfW, x1 = cam.x + halfW, y0 = cam.y - halfH, y1 = cam.y + halfH;
  L.ops.push({ o: 'setTransform', a: [f64hex(2), f64hex(0), f64hex(0), f64hex(2), f64hex(0), f64hex(0)], s: null });
  {
    const m = 22 * 4;
    const vx0 = Math.max(0, Math.floor(x0 * 4) - m);
    const vy0 = Math.max(0, Math.floor(y0 * 4) - m);
    const vx1 = Math.min(W2, Math.ceil(x1 * 4) + m);
    const vy1 = Math.min(H2, Math.ceil(y1 * 4) + m);
    const pv = lastWcClear;
    if (pv) {
      L.clear(Math.min(vx0, pv.x0), Math.min(vy0, pv.y0),
        Math.max(vx1, pv.x1) - Math.min(vx0, pv.x0), Math.max(vy1, pv.y1) - Math.min(vy0, pv.y0));
    } else {
      L.clear(0, 0, W2, H2);
    }
    lastWcClear = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
  }
  L.ops.push({ o: 'save', a: [], s: null });
  L.ops.push({ o: 'scale', a: [f64hex(2), f64hex(2)], s: null });
  const sun = inp.fxPrefs.dayNight ? sunCached(fc) : null;
  // —— 单位循环（slot 序） ——
  for (const q of inp.units) {
    const u = {
      id: q.id, race: q.race, civ: q.civ, x: h2f(q.x), y: h2f(q.y),
      rx: q.rx == null ? undefined : h2f(q.rx), ry: q.ry == null ? undefined : h2f(q.ry),
      dpx: q.dpx == null ? undefined : h2f(q.dpx), dpy: q.dpy == null ? undefined : h2f(q.dpy),
      flip: q.flip, lx: q.lx == null ? undefined : h2f(q.lx), ly: q.ly == null ? undefined : h2f(q.ly),
      wep: q.wep, atk: h2f(q.atk), trait: q.trait, age: q.age, hurt: q.hurt,
      hp: h2f(q.hp), maxHp: h2f(q.maxHp), panic: q.panic == null ? undefined : h2f(q.panic),
      boat: !!q.boat, caravan: q.caravan, king: !!q.king,
      // M-U7a：mrr* 消费字段补齐（对齐 rebuildU 形态——黄金场景无此字段时按健康缺省；infected 缺省 0 防 undefined!==0 误判）
      infected: q.infected ?? 0, traitName: q.trait ?? null, armS: null, hlmS: null,
      maxAge: q.maxAge ?? 60, job: q.job ?? 0,
    };
    if (u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
    const civ = u.civ >= 0 && inp.civs ? inp.civs.find((c) => c.id === u.civ) : null;
    const civColor = civ && civ.alive !== false ? civ.color : null;
    const civHex = civ && civ.alive !== false ? civ.colorHex : null;
    drawUnitSprite(L, u, inp, cam, fc, sun, civColor, civHex, direct);
    // hp 条
    if (inp.fxPrefs.hpBars && cam.zoom >= 6 && u.hp < u.maxHp && !u.boat) {
      const px = u.dpx ?? (u.rx ?? u.x) * 2;
      const py = u.dpy ?? (u.ry ?? u.y) * 2;
      const w = 4;
      const ratio = Math.max(0, u.hp / u.maxHp);
      L.fill('rgba(20,16,12,0.75)', px - 1, py - 6, w, 1);
      L.fill(ratio > 0.5 ? '#5fc65b' : ratio > 0.25 ? '#ffd93d' : '#cf3f2e', px - 1, py - 6, Math.max(1, Math.round(w * ratio)), 1);
    }
    // 恐慌标记
    const pk = u.panic ?? 0;
    if (pk >= 0.55 && cam.zoom >= 6 && !u.boat) {
      const px = u.dpx ?? (u.rx ?? u.x) * 2;
      const py = u.dpy ?? (u.ry ?? u.y) * 2;
      const by = (inp.fxPrefs.hpBars && u.hp < u.maxHp) ? py - 7 : py - 5;
      if (pk >= 0.72) {
        if (fc % 36 < 26) {
          L.fill('#ef4444', px, by - 3, 1, 2);
          L.fill('#ef4444', px, by, 1, 1);
        }
      } else {
        L.fill('#f59e0b', px, by - 1, 2, 2);
      }
    }
    // 选中框
    if (u.id === inp.selectedId) {
      const px = u.dpx ?? (u.rx ?? u.x) * 2;
      const py = u.dpy ?? (u.ry ?? u.y) * 2;
      if (u.boat) L.stroke('rgba(255,255,255,0.9)', 1, px - 3, py - 5, 7, 8);
      else L.stroke('rgba(255,255,255,0.9)', 1, px - 2, py - 3, 5, 6);
    }
  }
  L.ops.push({ o: 'restore', a: [], s: null });
  return L;
}

function drawUnitSprite(L, u, inp, cam, fc, sun, civColor, civHex, direct = false) {
  if (u.boat) { if (direct) { mrrDrawBoat(L, u, civColor, fc); return; } L.bail('drawBoat', [f64hex(u.x), f64hex(u.y), f64hex(fc)]); return; }   // M-U7a：direct→mrr 直调（蓝本 drawBoat(wc,u,civColor,fc)）
  const def = RDEF[u.race] ?? DYN_RDEF.get(u.race);
  if ((u.caravan ?? 0) > 0) { if (direct) { mrrDrawCaravan(L, u, civColor, fc); return; } L.bail('drawCaravan', [f64hex(u.x), f64hex(u.y), f64hex(fc)]); return; }
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  if (!def.aquatic && !def.flying && u.trait !== 'giant') {
    if (inp.fxPrefs.dayNight && sun) {
      const sox = Math.round(sun.sx * sun.len * 2);
      const soy = Math.round(sun.sy * sun.len);
      L.fill(sunUnitShadowStyle, px - 1 + sox, py + 2 + soy, 3, 1);
      if (sun.len > 1.7) L.fill(sunUnitShadowStyle, px - 1 + sox * 2, py + 2 + soy, 2, 1);
    } else {
      L.fill('rgba(12,9,6,0.22)', px - 1, py + 2, 3, 1);
    }
  }
  if (!def.aquatic && !def.flying) {
    let jk = 1;
    if (def.sprite === 'person') {
      if (u.age < 4) jk = 0.76 + (u.age / 4) * 0.24;
    } else if (u.age < def.maxAge * 0.14) {
      jk = 0.78 + (u.age / (def.maxAge * 0.14)) * 0.22;
    }
    if (jk < 0.995) {
      L.ops.push({ o: 'save', a: [], s: null });
      L.ops.push({ o: 'translate', a: [f64hex(px), f64hex(py + 3)], s: null });
      L.ops.push({ o: 'scale', a: [f64hex(jk), f64hex(jk)], s: null });
      L.ops.push({ o: 'translate', a: [f64hex(-px), f64hex(-(py + 3))], s: null });
      drawUnitBody(L, u, def, inp, cam, fc, civColor, civHex, direct);
      L.ops.push({ o: 'restore', a: [], s: null });
      return;
    }
  }
  if (u.trait === 'tiny' && !def.aquatic) {
    L.ops.push({ o: 'save', a: [], s: null });
    L.ops.push({ o: 'translate', a: [f64hex(px), f64hex(py + 3)], s: null });
    L.ops.push({ o: 'scale', a: [f64hex(0.72), f64hex(0.72)], s: null });
    L.ops.push({ o: 'translate', a: [f64hex(-px), f64hex(-(py + 3))], s: null });
    drawUnitBody(L, u, def, inp, cam, fc, civColor, civHex, direct);
    L.ops.push({ o: 'restore', a: [], s: null });
    return;
  }
  const hu = u.hurt;
  if (hu > 14 && !def.aquatic) {
    const k = (hu - 14) / 10;
    L.ops.push({ o: 'save', a: [], s: null });
    L.ops.push({ o: 'translate', a: [f64hex(px), f64hex(py + 3)], s: null });
    L.ops.push({ o: 'scale', a: [f64hex(1 + 0.22 * k), f64hex(1 - 0.26 * k)], s: null });
    L.ops.push({ o: 'translate', a: [f64hex(-px), f64hex(-(py + 3))], s: null });
    drawUnitBody(L, u, def, inp, cam, fc, civColor, civHex, direct);
    L.ops.push({ o: 'restore', a: [], s: null });
    return;
  }
  drawUnitBody(L, u, def, inp, cam, fc, civColor, civHex, direct);
}

function onWaterTile(inp, u, beachOk) {
  const t = inp.terrainAt;
  if (t === T.WATER || t === T.DEEP) return true;
  return beachOk && t === T.SAND;
}

function drawUnitBody(L, u, def, inp, cam, fc, civColor, civHex, direct = false) {
  const zoom = cam.zoom;
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const king = !!u.king;
  if (def.sprite === 'fish' || def.sprite === 'turtle' || def.sprite === 'shark') {
    if (!onWaterTile(inp, u, false)) return;
  } else if (def.sprite === 'crab' && !onWaterTile(inp, u, true)) {
    return;
  }
  if (zoom >= 8) {
    const fx = Math.round(u.rx ?? u.x);
    const fy = Math.round(u.ry ?? u.y) + 1;
    const tx = Math.round(px * 2) - fx;
    const ty = Math.round(py * 2) - fy;
    let fin = false;
    if (def.sprite === 'person') {
      if (u.trait !== 'giant') {
        L.ops.push({ o: 'save', a: [], s: null });
        L.ops.push({ o: 'scale', a: [f64hex(0.5), f64hex(0.5)], s: null });
        L.ops.push({ o: 'translate', a: [f64hex(tx), f64hex(ty)], s: null });
        if (direct) mrrDrawPersonFine(L, u, def.vis || null, civColor, fc, king);   // M-U7a：direct→直调；M-U7c：vis=def.vis（蓝本 drawPersonFine 内部 RACES 自查的镜像上提，静态 false→null）
        else L.bail('drawPersonFine', [f64hex(u.x), f64hex(u.y), f64hex(fc), f64hex(king ? 1 : 0)]);
        L.ops.push({ o: 'restore', a: [], s: null });
        fin = true;
      }
    } else {
      const quad = QUAD_FINE[def.sprite];
      if (quad && !def.vis) {
        L.ops.push({ o: 'save', a: [], s: null });
        L.ops.push({ o: 'scale', a: [f64hex(0.5), f64hex(0.5)], s: null });
        L.ops.push({ o: 'translate', a: [f64hex(tx), f64hex(ty)], s: null });
        if (direct) mrrDrawQuadFine(L, u, def.sprite, fc, king);   // M-U7a：direct→直调（蓝本 drawQuadFine(wc,u,quad,fc,king)）
        else L.bail('drawQuadFine', [f64hex(u.x), f64hex(u.y), f64hex(fc), f64hex(king ? 1 : 0)]);
        L.ops.push({ o: 'restore', a: [], s: null });
        fin = true;
      }
    }
    if (fin) return;
  }
  if (zoom < 2.5) {
    if (def.sprite === 'person') {
      L.fill(civHex != null ? civHex : u.hurt > 0 ? '#ff6b5e' : '#9a8460', px - 1, py - 2, 2, 2);
      if (king) L.fill('#e6ba6c', px - 1, py - 3, 2, 1);
      return;
    }
    if (!def.vis) {
      const lod = ANIMAL_LOD[def.sprite];
      if (lod) {
        L.fill(u.hurt > 0 ? '#ff6b5e' : lod[0], px - (lod[2] >> 1), py - lod[3], lod[2], lod[3]);
        return;
      }
    }
  } else if (zoom < 5.6) {
    if (def.sprite === 'person') {
      const f = u.flip ? -1 : 1;
      const hurt = u.hurt > 0;
      const bx0 = f > 0 ? px : px - 1;
      const moving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
      const g = moving ? (fc >> 3) & 1 : -1;
      if (g === 0) {
        L.fill('#3a342c', bx0, py, 1, 2);
        L.fill('#3a342c', bx0 + 1, py + 1, 1, 1);
      } else if (g === 1) {
        L.fill('#3a342c', bx0, py + 1, 1, 1);
        L.fill('#3a342c', bx0 + 1, py, 1, 2);
      } else {
        L.fill('#3a342c', bx0, py, 1, 2);
        L.fill('#3a342c', bx0 + 1, py, 1, 2);
      }
      L.fill(hurt ? '#ff6b5e' : civHex ?? '#9a8460', bx0, py - 2, 2, 2);
      L.fill(hurt ? '#ff6b5e' : '#d9a066', bx0 + (f > 0 ? 1 : 0), py - 3, 1, 1);
      if (u.wep) {
        L.fill(u.wep === 'musket' || u.wep === 'rifle' || u.wep === 'laser_rifle' ? '#4a4038' : '#d9d9d9',
          bx0 + (f > 0 ? 2 : -1), (u.atk ?? 0) > 0 ? py - 4 : py - 2, 1, 1);
      }
      L.fill('rgba(20,16,12,0.4)', bx0, py + 2, 2, 1);
      if (king) drawCrown(L, bx0 + (f > 0 ? 1 : 0), py - 4);
      return;
    }
    if (!def.vis) {
      const lod = ANIMAL_LOD[def.sprite];
      if (lod) {
        const hurt = u.hurt > 0;
        const w = lod[2], h = lod[3];
        const hw = w >> 1;
        const bx = px - hw, by = py - h;
        const f = u.flip ? -1 : 1;
        const moving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
        const g = moving ? (fc >> 3) & 1 : -1;
        L.fill(hurt ? '#cf3f2e' : lod[1], bx, py, 1, 1);
        L.fill(hurt ? '#cf3f2e' : lod[1], bx + w - 1, py, 1, 1);
        if (g !== 1) L.fill(hurt ? '#cf3f2e' : lod[1], bx + 1, py, 1, 1);
        if (w >= 4 && g !== 0) L.fill(hurt ? '#cf3f2e' : lod[1], bx + w - 2, py, 1, 1);
        L.fill(hurt ? '#ff6b5e' : lod[0], bx, by, w, h);
        if (w >= 3) L.fill('rgba(255,255,240,0.3)', bx + 1, by, 1, 1);
        const headX = px + (u.flip ? -hw - 1 : hw);
        L.fill(hurt ? '#cf3f2e' : lod[1], headX, by + (h > 2 ? 1 : 0), 1, 1);
        L.fill('rgba(20,16,12,0.35)', bx, py + 1, w, 1);
        if (king) drawCrown(L, headX, by - 1);
        return;
      }
    }
  }
  // v3 涌现物种（视觉基因组）：动态种化的非人形物种走程序化生物绘制 —— 外观随进化真实变化（M-U7c 接线；蓝本 render.ts L2319-2331）
  if (def.vis && def.sprite !== 'person') {
    const mShape = def.aquatic ? 'aquatic' : def.sandswim ? 'worm' : (def.sprite === 'basilisk' || def.sprite === 'snake' || def.sprite === 'dragon') ? 'serpent' : null;
    const vc = visCacheFor6(u.race, def.vis, def.sprite);
    if (mShape && vc) { if (direct) { mrrDrawEmergentMonster(L, u, vc, mShape, fc); return; } L.bail('drawEmergentMonster', [f64hex(u.x), f64hex(u.y), f64hex(fc)]); return; }
    if (vc) { if (direct) { mrrDrawEmergentCreature(L, u, vc, fc); return; } L.bail('drawEmergentCreature', [f64hex(u.x), f64hex(u.y), f64hex(fc)]); return; }
  }
  // 全绘档 switch → sprites.ts 域（M-U5）→ bail 契约
  const BAIL_FNS = {
    person: 'drawPerson', sheep: 'drawSheep', wolf: 'drawWolf', snowwolf: 'drawSnowWolf', bear: 'drawBear',
    deer: 'drawDeer', penguin: 'drawPenguin', camel: 'drawCamel', scorpion: 'drawScorpion', snake: 'drawSnake',
    dragon: 'drawDragon', skeleton: 'drawSkeleton', demon: 'drawDemon', angel: 'drawAngel', phoenix: 'drawPhoenix',
    ent: 'drawEnt', lich: 'drawLich', hydra: 'drawHydra', mage: 'drawMage', troll: 'drawTroll', ogre: 'drawOgre',
    whitewalker: 'drawWhiteWalker', vampire: 'drawVampire', kraken: 'drawKraken', sandworm: 'drawSandworm',
    basilisk: 'drawBasilisk', chicken: 'drawChicken', pig: 'drawPig', rabbit: 'drawRabbit', fox: 'drawFox',
    fish: 'drawFish', crab: 'drawCrab', turtle: 'drawTurtle', shark: 'drawShark',
  };
  const bf = BAIL_FNS[def.sprite];
  if (bf && !direct) {
    // 精灵调用签名：sheep/wolf/snowwolf/bear/deer 无 fc 参（drawXxx(wc,u)）→ 第三参 null；其余 drawXxx(wc,u,fc)
    const noFc = def.sprite === 'sheep' || def.sprite === 'wolf' || def.sprite === 'snowwolf' || def.sprite === 'bear' || def.sprite === 'deer';
    L.bail(bf, [f64hex(u.x), f64hex(u.y), noFc ? null : f64hex(fc)]);
  } else if (direct) {
    // M-U7a：direct→mrr* 直调（蓝本 render.ts L2333 switch 逐字序）
    switch (def.sprite) {
      case 'person': mrrDrawPerson(L, u, def.vis || null, civColor, fc); break;   // M-U7c：vis=def.vis（蓝本 drawPerson 内部 RACES 自查的镜像上提）
      case 'sheep': mrrDrawSheep(L, u); break;
      case 'wolf': mrrDrawWolf(L, u); break;
      case 'snowwolf': mrrDrawSnowWolf(L, u); break;
      case 'bear': mrrDrawBear(L, u); break;
      case 'deer': mrrDrawDeer(L, u); break;
      case 'penguin': mrrDrawPenguin(L, u, fc); break;
      case 'camel': mrrDrawCamel(L, u, fc); break;
      case 'scorpion': mrrDrawScorpion(L, u, fc); break;
      case 'snake': mrrDrawSnake(L, u, fc); break;
      case 'dragon': mrrDrawDragon(L, u, fc); break;
      case 'skeleton': mrrDrawSkeleton(L, u, fc); break;
      case 'demon': mrrDrawDemon(L, u, fc); break;
      case 'angel': mrrDrawAngel(L, u, fc); break;
      case 'phoenix': mrrDrawPhoenix(L, u, fc); break;
      case 'ent': mrrDrawEnt(L, u, fc); break;
      case 'lich': mrrDrawLich(L, u, fc); break;
      case 'hydra': mrrDrawHydra(L, u, fc); break;
      case 'mage': mrrDrawMage(L, u, fc); break;
      case 'troll': mrrDrawTroll(L, u, fc); break;
      case 'ogre': mrrDrawOgre(L, u, fc); break;
      case 'whitewalker': mrrDrawWhiteWalker(L, u, fc); break;
      case 'vampire': mrrDrawVampire(L, u, fc); break;
      case 'kraken': mrrDrawKraken(L, u, fc); break;
      case 'sandworm': mrrDrawSandworm(L, u, fc); break;
      case 'basilisk': mrrDrawBasilisk(L, u, fc); break;
      case 'chicken': mrrDrawChicken(L, u, fc); break;
      case 'pig': mrrDrawPig(L, u, fc); break;
      case 'rabbit': mrrDrawRabbit(L, u, fc); break;
      case 'fox': mrrDrawFox(L, u, fc); break;
      case 'fish': mrrDrawFish(L, u, fc); break;
      case 'crab': mrrDrawCrab(L, u, fc); break;
      case 'turtle': mrrDrawTurtle(L, u, fc); break;
      case 'shark': mrrDrawShark(L, u, fc); break;
      default: {
        const lod = ANIMAL_LOD[def.sprite];
        const lw = lod ? lod[2] : 2, lh = lod ? lod[3] : 2;
        L.fill(u.hurt > 0 ? '#ff6b5e' : lod ? lod[0] : '#9a8460', px - (lw >> 1), py - lh, lw, lh);
        break;
      }
    }
  } else {
    const lod = ANIMAL_LOD[def.sprite];
    const lw = lod ? lod[2] : 2, lh = lod ? lod[3] : 2;
    L.fill(u.hurt > 0 ? '#ff6b5e' : lod ? lod[0] : '#9a8460', px - (lw >> 1), py - lh, lw, lh);
  }
  if (king && def.sprite === 'person') drawCrown(L, px, py - 4);
  if (def.dynTint) {
    L.fill(u.hurt > 0 ? '#ff6b5e' : def.dynTint, px, py - 4, 1, 1);
  }
}

// ============================================================
// 对账
// ============================================================
let fail = 0, total = 0;
function cmp(label, a, b) {
  total++;
  if (a !== b) {
    fail++;
    console.error(`  [FAIL] ${label}`);
    if (typeof a === 'string' && a.startsWith('[') ) {
      const A = JSON.parse(a), B = JSON.parse(b);
      for (let k = 0; k < Math.max(A.length, B.length); k++) {
        if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) {
          console.error(`    op[${k}] gold=${JSON.stringify(B[k])}`);
          console.error(`    op[${k}] mirr=${JSON.stringify(A[k])}`);
          break;
        }
      }
    }
  }
}
// 直接运行：node render-transcript.mjs（import 时只加载函数不跑主循环——M-U7a 双模式改造）
const isMainRT = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMainRT) runRenderTranscript();

function runRenderTranscript() {
for (const sc of GOLD.terrain) {
  for (let k = 0; k < sc.tiles.length; k++) {
    const got = terrainBake(sc.tiles[k].in);
    cmp(`${sc.name}#${k} rgba`, got, sc.tiles[k].rgba);
  }
}
for (const sc of GOLD.props) {
  const L = propsBake(sc.in);
  cmp(`${sc.name} ops`, JSON.stringify(L.ops), JSON.stringify(sc.ops));
  cmp(`${sc.name} bails`, JSON.stringify(L.bails), JSON.stringify(sc.bails));
}
for (const sc of GOLD.units) {
  // M-U7a 接线后 render.json 单元域 = 直通黄金（gen-render unitDirect）→ 镜像走 direct 分支（mrr* 直调）
  const L = unitScene(sc.in, true);
  cmp(`${sc.name} ops(${L.ops.length} vs ${sc.ops.length})`, JSON.stringify(L.ops), JSON.stringify(sc.ops));
  cmp(`${sc.name} bails`, JSON.stringify(L.bails), JSON.stringify(sc.bails));
}
console.log(`render-transcript: ${total - fail}/${total} ${fail === 0 ? 'ALL PASS' : 'FAIL'}`);
if (fail > 0) process.exit(1);
}

export { unitScene };
