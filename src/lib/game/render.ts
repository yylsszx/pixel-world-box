// ============ WorldBox Replica — Rendering pipeline ============
import type { Army, Effect, Unit } from './types';
import { T, R, RACES } from './types';
import { drawBuilding, drawDragon, drawFire, drawPerson, drawSheep, drawTornado, drawWolf, drawBear, drawDeer, drawPenguin, drawCamel, drawScorpion, drawSnake, drawSnowWolf, drawBoat, drawSkeleton, drawDemon, drawAngel, drawPhoenix, drawEnt, drawLich, drawHydra, drawMage, drawItem, drawTroll, drawOgre, drawWhiteWalker, drawVampire, drawKraken, drawSandworm, drawBasilisk, drawCaravan, drawEmergentCreature, drawEmergentMonster, drawPersonFine, drawQuadFine, drawChicken, drawPig, drawRabbit, drawFox, drawFish, drawCrab, drawTurtle, drawShark } from './sprites';
import { visCacheFor } from './emergence';
import { BUILDING_DEFS } from './types';
import { GameEngine } from './engine';
import { AW, AH, CELL } from './nature';

const DEEP_BG = '#0d1b2e';

/** —— 性能优化（Task 42-a）：帧级缓存，避免每单位/每建筑重复计算与字符串分配 —— */
/** 太阳状态帧级缓存：drawUnitSprite 每单位都调 sunState()（对象分配+三角函数）→ 全帧共享一次计算 */
const sunScratch = { level: 1, sx: 1, sy: 0.45, len: 0.6 };
let sunCacheFrame = -1;
/** 单位软阴影色（仅随 sun.level 变化 → 帧级常量字符串，预生成免逐单位拼接） */
let sunUnitShadowStyle = 'rgba(12,9,6,0.24)';
/** 建筑投影色（同上，系数不同） */
let sunBldShadowStyle = 'rgba(12,9,6,0.23)';
function sunCached(engine: GameEngine) {
  if (sunCacheFrame !== engine.frameCount) {
    const s = engine.sunState();
    sunScratch.level = s.level;
    sunScratch.sx = s.sx;
    sunScratch.sy = s.sy;
    sunScratch.len = s.len;
    sunUnitShadowStyle = `rgba(12,9,6,${(0.15 + 0.09 * (1 - s.level)).toFixed(3)})`;
    sunBldShadowStyle = `rgba(12,9,6,${(0.15 + 0.08 * (1 - s.level)).toFixed(3)})`;
    sunCacheFrame = engine.frameCount;
  }
  return sunScratch;
}

/** 昼夜色调帧级复用对象（applyLighting 与夜幕暗角两处串行调用，无并发重叠 → 免每次对象字面量） */
const dayTintScratch = { r: 255, g: 255, b: 255, a: 0, n: 0 };

/** —— Task 48-A3：屏幕空间渐变缓存 ——
 *  原实现每帧 createRadialGradient ×3（战火暗角/晨昏天光/夜幕暗角）—— 渐变对象创建是
 *  Canvas 最重的分配之一。改为「固定色标 + globalAlpha 调制」：色标只随画布尺寸变化，
 *  呼吸/夜色强度走 globalAlpha，每帧零分配 */
const screenGradCache: {
  key: string;
  war: CanvasGradient | null;
  dawn: CanvasGradient | null;
  night: CanvasGradient | null;
} = { key: '', war: null, dawn: null, night: null };

function ensureScreenGradients(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  const key = `${cw}x${ch}`;
  if (screenGradCache.key === key) return;
  // 战火暗角：外缘饱和红（强度走 globalAlpha）
  const war = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.36, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
  war.addColorStop(0, 'rgba(180,20,20,0)');
  war.addColorStop(1, 'rgba(160,18,18,1)');
  // 晨昏天光：暖橙渐晕（同色系三段，w 走 globalAlpha）
  const gx = cw * 0.15; // 黄昏侧（破晓侧绘制时水平翻转，渐变本体以左为准）
  const gy = ch * 0.42;
  const dawn = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(cw, ch) * 0.8);
  dawn.addColorStop(0, 'rgba(255,148,66,0.22)');
  dawn.addColorStop(0.55, 'rgba(255,170,90,0.09)');
  dawn.addColorStop(1, 'rgba(255,150,70,0)');
  // 夜幕暗角：深蓝晕影（n 走 globalAlpha）
  const night = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.30, cw / 2, ch / 2, Math.max(cw, ch) * 0.66);
  night.addColorStop(0, 'rgba(8,12,26,0)');
  night.addColorStop(1, 'rgba(8,12,26,0.38)');
  screenGradCache.key = key;
  screenGradCache.war = war;
  screenGradCache.dawn = dawn;
  screenGradCache.night = night;
}

/** 晨昏渐晕的水平翻转版本（破晓在东侧）：与 dawn 同尺寸缓存，仅变换矩阵不同 */
function drawDawnGlow(ctx: CanvasRenderingContext2D, cw: number, ch: number, alpha: number, flip: boolean) {
  if (alpha <= 0.15) return;
  ensureScreenGradients(ctx, cw, ch);
  ctx.save();
  if (flip) {
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = screenGradCache.dawn!;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}

/** —— Task 48-A3：伤害数字字体串缓存（字号随 zoom 连续变化，命中率高） —— */
const dmgFontCache = { size: -1, str: '' };
function dmgFontOf(fs: number): string {
  if (dmgFontCache.size !== fs) {
    dmgFontCache.size = fs;
    dmgFontCache.str = `bold ${fs}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  }
  return dmgFontCache.str;
}

/** —— P0-B：像素粒子池（世界坐标 · 对象复用 · 零热路径分配）——
 *  爆炸火花 / 血溅 / 沙尘 / 命中白闪共用一个数组对象池：死亡粒子回收到 free 表，
 *  上限硬裁（fxDensity 缩放），逐帧 update+draw 各 1-2px fillRect。字段即全部状态。 */
interface FxParticle { x: number; y: number; vx: number; vy: number; life: number; ttl: number; size: number; grav: number; col: string }
const FX_POOL: FxParticle[] = []; // 活跃粒子（swap-pop 删除）
const FX_FREE: FxParticle[] = []; // 死亡粒子回收池
const FX_CAPS_P = [120, 210, 300]; // 粒子硬上限（fxDensity 低/标准/华丽）
const FX_MUL = [0.5, 0.75, 1]; // 生成量缩放（同上三档）
/** 预置颜色常量（热路径零字符串拼接） */
const FX_SPARK_COLS = ['#ffd93d', '#ff9b2d', '#ff7b2d', '#cf3f2e', '#8d8d8d'];
const FX_BLOOD_COLS = ['#c81e16', '#8c140f', '#a01a12'];
const FX_DUST_COLS = ['#decb8d', '#cbb478', '#e8dcaa'];
const FX_HIT_COLS = ['#fff3c4', '#ffd93d'];

/** 生成粒子（池满/关闭时静默丢弃；count 已按密度档缩放） */
function fxSpawn(x: number, y: number, vx: number, vy: number, ttl: number, size: number, grav: number, col: string) {
  if (FX_POOL.length >= FX_CAPS_P[engineFxTier]) return;
  const p = FX_FREE.pop() ?? ({} as FxParticle);
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = ttl; p.ttl = ttl; p.size = size; p.grav = grav; p.col = col;
  FX_POOL.push(p);
}
/** 引擎特效密度档位（render 开头同步一次，热路径只读数字） */
let engineFxTier = 1;

/** 粒子步进 + 绘制（动态层 B 每帧一次；swap-pop 删除零分配） */
function stepFxParticles(wc: CanvasRenderingContext2D) {
  for (let i = FX_POOL.length - 1; i >= 0; i--) {
    const p = FX_POOL[i];
    p.life--;
    if (p.life <= 0) {
      const last = FX_POOL.pop()!;
      if (i < FX_POOL.length) FX_POOL[i] = last;
      FX_FREE.push(p);
      continue;
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.grav;
    wc.globalAlpha = p.life < p.ttl * 0.5 ? p.life / (p.ttl * 0.5) : 1;
    wc.fillStyle = p.col;
    wc.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  wc.globalAlpha = 1;
}

/** 爆炸火花（12-24 颗，橙红灰三系，带重力；n 已按密度档缩放） */
function fxSparks(px: number, py: number, n: number, seed: number) {
  for (let k = 0; k < n; k++) {
    const h = ((seed * 2654435761 + k * 2246822519) >>> 0);
    const ang = (h % 628) / 100;
    const spd = 0.18 + ((h >> 9) % 30) / 100;
    fxSpawn(
      px, py,
      Math.cos(ang) * spd, Math.sin(ang) * spd - 0.12,
      16 + (h % 18), (h & 3) === 0 ? 2 : 1, 0.014,
      FX_SPARK_COLS[h % 5],
    );
  }
}

/** —— P0-B：3×5 点阵数字字模（0-9 与负号；每行 3 位，高位在左）—— */
const DIGIT_FONT: number[][] = [
  [7, 5, 5, 5, 7], // 0
  [2, 6, 2, 2, 7], // 1
  [7, 1, 7, 4, 7], // 2
  [7, 1, 3, 1, 7], // 3
  [5, 5, 7, 1, 1], // 4
  [7, 4, 7, 1, 7], // 5
  [7, 4, 7, 5, 7], // 6
  [7, 1, 2, 2, 2], // 7
  [7, 5, 7, 5, 7], // 8
  [7, 5, 7, 1, 7], // 9
];

/** 点阵数字绘制（cx 水平居中，cy 为字模顶；只绘 0-9 与 '-'，其他字符跳过占零宽） */
function drawPixelDigits(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, s: number, fill: string) {
  let n = 0;
  for (let k = 0; k < text.length; k++) {
    const c = text.charCodeAt(k);
    if ((c >= 48 && c <= 57) || c === 45) n++;
  }
  if (n === 0) return;
  ctx.fillStyle = fill;
  let x0 = Math.round(cx - (n * 4 * s - s) / 2);
  for (let k = 0; k < text.length; k++) {
    const c = text.charCodeAt(k);
    if (c === 45) { ctx.fillRect(x0, cy + 2 * s, s, s); x0 += 4 * s; continue; } // '-'
    const d = c - 48;
    if (d < 0 || d > 9) continue;
    const g = DIGIT_FONT[d];
    for (let row = 0; row < 5; row++) {
      const bits = g[row];
      const yy = cy + row * s;
      if (bits & 4) ctx.fillRect(x0, yy, s, s);
      if (bits & 2) ctx.fillRect(x0 + s, yy, s, s);
      if (bits & 1) ctx.fillRect(x0 + 2 * s, yy, s, s);
    }
    x0 += 4 * s;
  }
}

/** —— P0-A：国王金冠（3px 宽：#e6ba6c 主 + 亮芯；各 LOD 档位头顶通用，层 B 坐标）—— */
function drawCrown(wc: CanvasRenderingContext2D, cx: number, baseY: number) {
  wc.fillStyle = '#e6ba6c';
  wc.fillRect(cx - 1, baseY, 3, 1); // 冠带
  wc.fillRect(cx - 1, baseY - 1, 1, 1); // 左齿
  wc.fillRect(cx + 1, baseY - 1, 1, 1); // 右齿
  wc.fillStyle = '#ffe9a8';
  wc.fillRect(cx, baseY - 1, 1, 1); // 亮芯
}

/** 河道八方向（与 engine RIVER_DIRS 同序） */
const RIVER_DIRS: [number, number][] = [
  [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],
];

/** 河面波光：沿流向平移的波纹 + 偶发粼点（在 world 层逐帧绘制，代价低） */
function drawRiverFlow(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  const fc = engine.frameCount;
  const shimmer = fc % 2 === 0; // 波光只在偶帧绘制 → 像素风的呼吸感，也省一半开销
  for (const i of engine.riverTiles) {
    const x = i % 256;
    const y = (i / 256) | 0;
    if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue;
    const dir = RIVER_DIRS[engine.riverDir[i] - 1];
    if (!dir) continue;
    const px = x * 2;
    const py = y * 2;
    // 沿流向的投影相位 → 波峰向下游平移（约 0.22 帧/格 → 慢速流动感）
    // 注意：JS 取模保留符号，frameCount 大后为负 → 必须归一化到 [0,6)
    const s = x * dir[0] + y * dir[1];
    const w = (((s * 0.9 - fc * 0.22) % 6) + 6) % 6;
    if (w < 2) {
      wc.fillStyle = '#a5d8ff';
      if (dir[0] !== 0 && dir[1] !== 0) {
        // 斜向流：波纹垂直于流向，跨 tile 画两段
        wc.fillRect(px + (dir[0] > 0 ? 0 : 1), py + (dir[1] > 0 ? 0 : 1), 2, 1);
      } else if (dir[1] !== 0) {
        wc.fillRect(px, py + (dir[1] > 0 ? 1 : 0), 2, 1);
      } else {
        wc.fillRect(px + (dir[0] > 0 ? 1 : 0), py, 1, 2);
      }
    }
    // 粼点：按 tile 哈希偶发的高光白点（每 ~48 帧一闪，各 tile 错开）
    if (shimmer) {
      const h = (i * 2654435761) >>> 0;
      if ((h + (fc >> 1)) % 97 < 3) {
        wc.fillStyle = '#e4f4ff';
        wc.fillRect(px + (h & 1), py + ((h >> 3) & 1), 1, 1);
      }
    }
  }
}

/** 环境氛围粒子：海岸浪花 · 极地飘雪 · 沙漠扬尘 · 岩浆气泡 · 深海微澜
 *  逐帧只处理可见窗口；哈希门控稀疏采样，奇偶帧各画一半 → 像素风呼吸感 + 半数绘制开销 */
function drawAmbience(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  const fc = engine.frameCount;
  const terrain = engine.terrain;
  const tx0 = Math.max(0, Math.floor(x0));
  const tx1 = Math.min(255, Math.ceil(x1));
  const ty0 = Math.max(0, Math.floor(y0));
  const ty1 = Math.min(159, Math.ceil(y1));
  const odd = (fc & 1) === 1;
  // —— Task 48-A2：稀疏候选遍历（原全窗逐格扫描在默认视野即 ~4 万格/帧）——
  // 候选表由引擎 setTerrain 增量维护；绘制端仅做可见窗剔除 + 哈希相位门控

  // 贴岸浅水：浪花（相位沿海岸滚动闪烁）+ 浅水波光（Task 48-B3：近岸微澜，与深海微澜同族但更亮）
  for (const i of engine.ambShore) {
    const x = i % 256;
    const y = (i / 256) | 0;
    if (x < tx0 || x > tx1 || y < ty0 || y > ty1) continue;
    const h = (i * 2654435761) >>> 0;
    const px = x * 2;
    const py = y * 2;
    if ((h + (fc >> 1)) % 44 < 9) {
      const up = y > 0 && terrain[i - 256] >= T.SAND && terrain[i - 256] !== T.LAVA;
      const dn = y < 159 && terrain[i + 256] >= T.SAND && terrain[i + 256] !== T.LAVA;
      const lf = x > 0 && terrain[i - 1] >= T.SAND && terrain[i - 1] !== T.LAVA;
      const rt = x < 255 && terrain[i + 1] >= T.SAND && terrain[i + 1] !== T.LAVA;
      if (up || dn || lf || rt) {
        // 浪头亮线（贴陆边）：相位 44 帧周期里占 9 帧 —— 拍岸节奏更绵长
        wc.fillStyle = '#eaf6ff';
        if (up) wc.fillRect(px, py, 2, 1);
        else if (dn) wc.fillRect(px, py + 1, 2, 1);
        if (lf) wc.fillRect(px, py, 1, 2);
        else if (rt) wc.fillRect(px + 1, py, 1, 2);
        // 漫溢漫延：脉冲中段整格淡白漫溢（浪头铺开的体积感；与静态烘焙泡沫叠出层次）
        const ph = (h + (fc >> 1)) % 44;
        if (ph >= 2 && ph < 6) {
          wc.fillStyle = 'rgba(224,240,252,0.30)';
          wc.fillRect(px, py, 2, 2);
        }
      }
    } else if ((h + (fc >> 2)) % 137 < 4) {
      // 近岸波光：稀疏的浅青色短横线（阳光在涟漪上的碎金）
      wc.fillStyle = 'rgba(168,208,232,0.42)';
      wc.fillRect(px + (h & 1), py + ((h >> 4) & 1), 2, 1);
    }
  }
  // 极地飘雪：每 3 格一片下落雪点（列固定、行随帧下移并回绕 6px 带）
  for (const i of engine.ambSnow) {
    const x = i % 256;
    const y = (i / 256) | 0;
    if (x < tx0 || x > tx1 || y < ty0 || y > ty1) continue;
    const h = (i * 2654435761) >>> 0;
    if (h % 3 !== 0) continue;
    const px = x * 2;
    const py = y * 2;
    const speed = 0.1 + (h % 5) * 0.04;
    const fy = py + Math.floor(((h >> 5) + fc * speed) % 6);
    const sway = ((h >> 9) + (fc >> 3)) & 1;
    wc.fillStyle = 'rgba(248,251,255,0.85)';
    wc.fillRect(px + sway, fy, 1, 1);
  }
  // 沙漠扬尘：偶发横向漂移的沙尘短线（顺真实风向漂移——西风带向东/信风向西）
  for (const i of engine.ambSand) {
    const x = i % 256;
    const y = (i / 256) | 0;
    if (x < tx0 || x > tx1 || y < ty0 || y > ty1) continue;
    const h = (i * 2654435761) >>> 0;
    if ((h + (fc >> 2)) % 74 >= 3) continue;
    const px = x * 2;
    const py = y * 2;
    const [wu] = engine.nature.windAt(x >> 3, y >> 3);
    const dir = wu >= 0 ? 1 : -1;
    const dx = Math.floor(((h >> 6) + fc * 0.12) % 8) * dir;
    wc.fillStyle = 'rgba(228,208,150,0.5)';
    wc.fillRect(px + dx, py + (h & 1), 3, 1);
  }
  // 岩浆气泡：亮橙亮黄点闪现后破灭（相位两段）
  for (const i of engine.ambLava) {
    const x = i % 256;
    const y = (i / 256) | 0;
    if (x < tx0 || x > tx1 || y < ty0 || y > ty1) continue;
    const h = (i * 2654435761) >>> 0;
    const ph = (h + (fc >> 1)) % 56;
    if (ph >= 6) continue;
    const px = x * 2;
    const py = y * 2;
    wc.fillStyle = ph < 3 ? '#ffb347' : '#ffd93d';
    wc.fillRect(px + (h & 1), py + ((h >> 3) & 1), ph < 3 ? 1 : 2, 1);
  }
  // 冰面闪熠：稀疏的白色冰晶高光（相位交错闪烁）
  for (const i of engine.ambIce) {
    const x = i % 256;
    const y = (i / 256) | 0;
    if (x < tx0 || x > tx1 || y < ty0 || y > ty1) continue;
    const h = (i * 2654435761) >>> 0;
    if ((h + (fc >> 1)) % 91 >= 3) continue;
    const px = x * 2;
    const py = y * 2;
    wc.fillStyle = '#f4fbff';
    wc.fillRect(px + (h & 1), py + ((h >> 3) & 1), 1, 1);
    if (((h >> 2) + fc) % 97 < 2) {
      wc.fillStyle = '#bfe3f2';
      wc.fillRect(px + 1 - (h & 1), py + 1 - ((h >> 3) & 1), 1, 1);
    }
  }
  // 深海微澜：DEEP 无稀疏表（大洋巨量且哈希相位随时段轮转无法预筛）——
  // 可见窗步进采样：窗口越大采样步长越长，密度以步长倍率补偿（视觉密度守恒）
  const area = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  const stride = area > 24000 ? 3 : area > 8000 ? 2 : 1;
  const gate = 3 * stride; // 接受窗随步长放大（补偿抽样密度）
  for (let y = ty0; y <= ty1; y += stride) {
    const row = y * 256;
    for (let x = tx0 + (y & 1); x <= tx1; x += stride) {
      const i = row + x;
      if (terrain[i] !== T.DEEP) continue;
      const h = (i * 2654435761) >>> 0;
      if (((h >> 3) & 1) !== (odd ? 1 : 0) || (h + (fc >> 2)) % 103 >= gate) continue;
      const px = x * 2;
      const py = y * 2;
      // 深海微澜：稀疏的暗青色短横线（风掠过洋面）
      wc.fillStyle = 'rgba(90,130,175,0.4)';
      wc.fillRect(px + (h & 1), py + ((h >> 4) & 1), 2, 1);
    }
  }
  // —— P1：深海滚动波带（沿风向推进的斜向微光，与上方微澜融合）——
  drawDeepWaves(engine, wc, tx0, tx1, ty0, ty1);
}

/** 滚动波带亮度查表（6 档加性淡白 —— 热路径零字符串拼接；上限压低避免「棋盘感」） */
const DEEP_WAVE_ALPHA = Array.from({ length: 6 }, (_, k) => `rgba(224,244,255,${(0.03 + k * 0.018).toFixed(3)})`);

/** P1 深海滚动波带：沿风向移动的斜向微光（周期 ~6s；stride 7 步进采样；只画深海格）
 *  实现：每带一条固定斜率的斜线（错开基线），只画行进波波峰尖（sin>0.8）——稀疏点缀而非连续亮带 */
function drawDeepWaves(engine: GameEngine, wc: CanvasRenderingContext2D, tx0: number, tx1: number, ty0: number, ty1: number) {
  const fc = engine.frameCount;
  const terrain = engine.terrain;
  // 风向：视口中心自然网格单元（整带同向 —— 波带是大尺度洋面特征）
  const [wu] = engine.nature.windAt((((tx0 + tx1) / 2) / CELL) | 0, ((((ty0 + ty1) / 2) / CELL) | 0));
  const dir = wu >= 0 ? 1 : -1;
  for (let band = 0; band < 2; band++) {
    // 带基线：视口纵向均布 + 慢速正弦漂移（洋面缓摆）
    const yBase = ty0 + ((band + 1) * (ty1 - ty0 + 1)) / 3 + Math.sin(fc * 0.003 + band * 2.1) * 6;
    const phaseDrift = fc * 0.045 * dir + band * 2.4; // 行进波相位（~360 帧 = 6s 一循环）
    for (let x = tx0 + band * 3; x <= tx1; x += 7) { // stride 7 步进（性能红线）
      const yy = yBase + (x - tx0) * 0.42; // 斜向坡度（与微澜短横线取向区分）
      const ty = yy | 0;
      if (ty < ty0 || ty > ty1) continue;
      if (terrain[ty * 256 + x] !== T.DEEP) continue; // 只画深海
      // 行进波：沿 x 的正弦，只取波峰尖（>0.8）画短促微光（加性淡白）
      const wave = Math.sin(x * 0.24 - phaseDrift);
      if (wave <= 0.8) continue;
      wc.fillStyle = DEEP_WAVE_ALPHA[Math.min(5, ((wave - 0.8) * 22) | 0)];
      wc.fillRect(x * 2, ty * 2, 5, 1);
    }
  }
}

/** 自然引擎天气层：大气网格湿度 → 漂移云团 / 雨幕 / 冬雪 + 气旋螺旋云带（world 层绘制）
 *  云随风场缓漂（正弦摆动模拟平流）；雨在湿气饱和格落下；冬季高云改降雪 */
function drawWeather(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  const nat = engine.nature;
  const fc = engine.frameCount;
  const winter = nat.season === 3;
  const ash = nat.ash;
  const cx0 = Math.max(0, (x0 / CELL) | 0);
  const cx1 = Math.min(AW - 1, (x1 / CELL) | 0);
  const cy0 = Math.max(0, (y0 / CELL) | 0);
  const cy1 = Math.min(AH - 1, (y1 / CELL) | 0);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const i = cy * AW + cx;
      const m = nat.moist[i];
      // —— 云团（湿度 > 0.58 才可见；alpha 随湿度攀升）——
      if (m > 0.58) {
        const a = Math.min(0.5, (m - 0.58) * 1.1);
        // 风切漂移：顺风偏置 + 缓慢正弦摆动（无环绕跳变）
        const [u] = nat.windAt(cx, cy);
        const offX = Math.sin(fc * 0.008 + cx * 0.9) * 3 + Math.sign(u) * Math.min(4, Math.abs(u) * 5);
        const offY = Math.cos(fc * 0.006 + cy * 0.7) * 1.5;
        const px = cx * CELL * 2 + 2 + offX;
        const py = cy * CELL * 2 + 2 + offY;
        // 云色：冬季灰 + 火山灰棕 + 风暴铅黑
        const stormy = m > 0.82;
        let cr = 248, cg = 250, cb = 252, ca = a;
        if (winter) { cr = 224; cg = 228; cb = 234; }
        if (ash > 0.1) { cr = Math.round(cr - 40 * ash); cg = Math.round(cg - 30 * ash); cb = Math.round(cb - 10 * ash); }
        if (stormy) { cr = Math.round(cr * 0.72); cg = Math.round(cg * 0.74); cb = Math.round(cb * 0.8); ca = Math.min(0.62, a + 0.12); }
        wc.fillStyle = `rgba(${cr},${cg},${cb},${ca})`;
        wc.fillRect(px, py, 9, 5);
        wc.fillRect(px + 3, py - 3, 6, 3);
        wc.fillRect(px + 6, py + 4, 7, 3);
      }
      // —— 灰烬霾团（v2 平流场）：棕灰雾团随风漂移（喷发源下风方向的移动霾区） ——
      const ashC = nat.ashF[i];
      if (ashC > 0.1) {
        const [u2, v2] = nat.windAt(cx, cy);
        const offX = Math.sin(fc * 0.005 + cx * 0.7) * 2 + Math.sign(u2) * Math.min(5, Math.abs(u2) * 6);
        const px = cx * CELL * 2 + 1 + offX;
        const py = cy * CELL * 2 + 1 + Math.cos(fc * 0.004 + cy * 0.5) * 1.5 + v2 * 2;
        const alpha = Math.min(0.5, ashC * 0.72);
        wc.fillStyle = `rgba(${Math.round(84 + 34 * ashC)},${Math.round(76 + 28 * ashC)},${Math.round(70 + 22 * ashC)},${alpha.toFixed(3)})`;
        wc.fillRect(px, py, 10, 6);
        wc.fillRect(px + 4, py - 2, 7, 4);
      }
      // —— 雨幕 / 雪片 ——
      const rain = nat.rainCell[i];
      if (rain > 60) {
        const n = rain > 150 ? 5 : 3;
        for (let k = 0; k < n; k++) {
          const hsh = ((i * 2654435761) >>> 0) + k * 97;
          const rx = cx * CELL * 2 + (hsh % 14);
          const ry = cy * CELL * 2 + ((hsh >> 4) % 14);
          // Task 48-B3：雨落水面改画涟漪（扩散的同心环像素；雨丝落在水上不真实）
          const rTile = engine.terrain[(((ry + 8) >> 1) | 0) * 256 + ((rx + 1) >> 1)];
          const onWater = !winter && (rTile === T.WATER || rTile === T.DEEP);
          if (onWater) {
            const ph = ((hsh >> 3) + fc * 0.8) % 18;
            const ra = ph < 6 ? 0.5 : ph < 12 ? 0.32 : 0.16; // 三段扩散渐隐
            wc.fillStyle = `rgba(196,222,244,${ra})`;
            if (ph < 6) {
              wc.fillRect(rx, ry, 1, 1); // 落点
            } else if (ph < 12) {
              wc.fillRect(rx - 1, ry, 1, 1); // 第一圈
              wc.fillRect(rx + 1, ry, 1, 1);
              wc.fillRect(rx, ry - 1, 1, 1);
              wc.fillRect(rx, ry + 1, 1, 1);
            } else {
              wc.fillRect(rx - 2, ry, 1, 1); // 第二圈（更淡）
              wc.fillRect(rx + 2, ry, 1, 1);
            }
          } else if (winter) {
            // 冬雨化雪：慢速飘落的白点
            const fy = ry + Math.floor(((hsh >> 7) + fc * 0.25) % 16);
            const sway = ((hsh >> 9) + (fc >> 3)) & 1;
            wc.fillStyle = 'rgba(244,250,255,0.8)';
            wc.fillRect(rx + sway, fy, 1, 1);
          } else {
            // 雨丝：快速斜落的短线
            const fy = ry + Math.floor(((hsh >> 7) + fc * 0.9) % 16);
            wc.fillStyle = 'rgba(148,188,238,0.55)';
            wc.fillRect(rx, fy, 1, 3);
          }
        }
      } else if (winter && m > 0.5 && ((cy / AH) < 0.18 || (cy / AH) > 0.82)) {
        // 极地冬空：稀疏飘雪（无雨也有落雪的氛围）
        const hsh = ((i * 40503) >>> 0) + fc;
        if (hsh % 37 < 3) {
          const rx = cx * CELL * 2 + (hsh % 15);
          const ry = cy * CELL * 2 + ((hsh >> 5) % 15);
          const fy = ry + Math.floor(((hsh >> 8) + fc * 0.2) % 15);
          wc.fillStyle = 'rgba(238,246,255,0.5)';
          wc.fillRect(rx, fy, 1, 1);
        }
      } else if (nat.season === 0 && m <= 0.62) {
        // 春日飘瓣（季节 × 万物）：草地/森林上空淡粉樱瓣随风缓舞——万物复苏的仪式感
        const ti = (cy * CELL + 3) * 256 + (cx * CELL + 3);
        const tt = engine.terrain[ti];
        if (tt === T.GRASS || tt === T.FOREST) {
          const hsh = ((i * 2654435761) >>> 0) + (fc >> 1);
          if (hsh % 43 < 3) {
            const rx = cx * CELL * 2 + (hsh % 15);
            const ry = cy * CELL * 2 + ((hsh >> 5) % 13);
            const sway = Math.sin(fc * 0.05 + (hsh & 7)) * 2.2; // 花瓣轻舞
            const fy = ry + Math.floor(((hsh >> 7) + fc * 0.12) % 14);
            const pale = (hsh >> 11) & 1; // 深粉/浅粉两色瓣
            wc.fillStyle = pale ? 'rgba(244,168,196,0.82)' : 'rgba(250,196,216,0.78)';
            // 3×3 px：天幕层小粒子在超采样+视口裁剪 blit 管线中有可见性下限（实测 2×2 会丢），3×3 恰为半格瓣面
            wc.fillRect(Math.round(rx + sway), fy, 3, 3);
          }
        }
      } else if (nat.season === 2 && m <= 0.62) {
        // 秋叶辞树（季节 × 万物）：森林上空橙红金三色落叶打旋而下——金风扫林的落叶雨
        const ti = (cy * CELL + 3) * 256 + (cx * CELL + 3);
        const tt = engine.terrain[ti];
        if (tt === T.FOREST) {
          const hsh = ((i * 2246822519) >>> 0) + (fc >> 1);
          if (hsh % 23 < 4) {
            const rx = cx * CELL * 2 + (hsh % 14);
            const ry = cy * CELL * 2 + ((hsh >> 5) % 12);
            const ph = ((hsh >> 7) + fc * 0.28) % 16;
            const sway = Math.sin(fc * 0.08 + (hsh & 15)) * 3; // 叶片打旋的横向摆
            const fy = ry + Math.floor(ph);
            const cp = (hsh >> 12) % 3; // 橙/红/金三色叶
            wc.fillStyle = cp === 0 ? 'rgba(228,118,34,0.85)' : cp === 1 ? 'rgba(202,58,38,0.82)' : 'rgba(226,164,44,0.84)';
            wc.fillRect(Math.round(rx + sway), fy, 3, 3); // 3×3：与花瓣同取可见性下限，落叶雨更醒目
          }
        }
      }
    }
  }
  // —— 气旋/冰暴：旋转螺旋云带 + 风暴眼 ——
  for (const st of nat.storms) {
    if (st.x < x0 - 14 || st.x > x1 + 14 || st.y < y0 - 14 || st.y > y1 + 14) continue;
    const px = st.x * 2;
    const py = st.y * 2;
    const R = (3 + st.strength * 7) * 2;
    const spin = fc * 0.02 * (0.6 + st.strength);
    const ice = st.kind === 'blizzard';
    const armN = 3;
    for (let arm = 0; arm < armN; arm++) {
      for (let t = 0.25; t <= 1; t += 0.12) {
        const ang = (arm / armN) * Math.PI * 2 + spin + t * 2.6;
        const rr = t * R;
        const ax = px + Math.cos(ang) * rr;
        const ay = py + Math.sin(ang) * rr;
        const w = 5 - t * 2;
        const alpha = (st.strength * 0.5) * (1 - t * 0.45);
        wc.fillStyle = ice
          ? `rgba(214,232,246,${alpha})`
          : `rgba(${Math.round(232 - t * 40)},${Math.round(236 - t * 30)},${Math.round(242 - t * 10)},${alpha})`;
        wc.fillRect(Math.round(ax - w / 2), Math.round(ay - w / 2), Math.max(2, w), Math.max(2, w));
      }
    }
    // 风暴眼（相对晴洞）+ 中心压暗
    wc.fillStyle = ice ? 'rgba(180,210,232,0.55)' : 'rgba(198,204,214,0.5)';
    wc.fillRect(px - 2, py - 2, 4, 4);
    wc.fillStyle = ice ? 'rgba(240,248,255,0.85)' : 'rgba(252,252,252,0.85)';
    wc.fillRect(px - 1, py - 1, 2, 2);
  }
}

/** 昼夜色调插值：nightness 0(白昼)→1(深夜)
 *  三段式转场：白昼 → 暖色平台（黄金时刻，黎明/黄昏各 ~1.5s 全暖）→ 深夜蓝紫 */
function dayTintOf(p: number): { r: number; g: number; b: number; a: number; n: number } {
  let n: number;
  if (p < 0.40) n = 0;
  else if (p < 0.52) n = (p - 0.40) / 0.12;
  else if (p < 0.88) n = 1;
  else n = 1 - (p - 0.88) / 0.12;
  // 帧级复用对象：填入共享 scratch 并返回（两处调用点串行执行，无交叉持有）
  const t = dayTintScratch;
  if (n <= 0) { t.r = 255; t.g = 255; t.b = 255; t.a = 0; t.n = 0; return t; }
  if (n < 0.35) {
    // 白昼 → 暖色渐入
    const k = n / 0.35;
    t.r = 255; t.g = Math.round(255 - 73 * k); t.b = Math.round(255 - 135 * k); t.a = 0.14 + 0.22 * k; t.n = n;
    return t;
  }
  if (n <= 0.65) {
    // 黄金时刻平台：全画面暖橙笼罩（黎明与黄昏共有的一段辉煌）
    const k = (n - 0.35) / 0.3;
    t.r = 255; t.g = Math.round(182 - 14 * k); t.b = Math.round(120 - 10 * k); t.a = 0.36 + 0.10 * k; t.n = n;
    return t;
  }
  // 暖色 → 深夜（暮尽天黑 / 破晓前的最后一刻蓝）
  const k = (n - 0.65) / 0.35;
  t.r = Math.round(255 - 175 * k);
  t.g = Math.round(168 - 70 * k);
  t.b = Math.round(110 + 58 * k);
  t.a = 0.46 + 0.12 * k;
  t.n = n;
  return t;
}

/** —— 质感工程 v3（Task 49）：夜间辉光缓冲（512² 精灵坐标系，与单位层同构） ——
 *  光晕不再以方块矩形直接画进 worldCanvas（放大后呈块状光斑），而是画进低分
 *  辨率 glowCanvas，再经 blurCanvas 降采样后在屏幕侧以 lighter 加性合成 ——
 *  双线性放大的软渐变 = 真·bloom（商业引擎夜光标配）。懒创建保 SSR 安全。 */
let glowCanvas: HTMLCanvasElement | null = null;
let glowCtx: CanvasRenderingContext2D | null = null;
let blurCanvas: HTMLCanvasElement | null = null;
let blurCtx: CanvasRenderingContext2D | null = null;
/** —— 质感工程 v3（Task 49）：低分辨率粒子双缓冲 ——
 *  氛围/云影/湿沙（地幕）与天气/闪电（天幕）全部改画到 512²（2px/格）画布：
 *  粒子是无定形软点，在 2048 超采样画布上光栅浪费 16 倍；低分粒子层是商业
 *  引擎的标配架构。两画布每帧全清 + 屏幕侧按 zoom/2 镜头变换分别合成在
 *  地形之上 / 世界层之上 —— 层级与旧管线严格一致。 */
let groundCanvas: HTMLCanvasElement | null = null;
let groundCtx: CanvasRenderingContext2D | null = null;
let skyCanvas: HTMLCanvasElement | null = null;
let skyCtx: CanvasRenderingContext2D | null = null;
function ensureFx() {
  if (groundCtx && skyCtx) return;
  groundCanvas = document.createElement('canvas');
  groundCanvas.width = 512;
  groundCanvas.height = 320;
  groundCtx = groundCanvas.getContext('2d')!;
  skyCanvas = document.createElement('canvas');
  skyCanvas.width = 512;
  skyCanvas.height = 320;
  skyCtx = skyCanvas.getContext('2d')!;
}

function ensureGlow() {
  if (glowCtx && blurCtx) return;
  glowCanvas = document.createElement('canvas');
  glowCanvas.width = 512;
  glowCanvas.height = 320;
  glowCtx = glowCanvas.getContext('2d')!;
  blurCanvas = document.createElement('canvas');
  blurCanvas.width = 256;
  blurCanvas.height = 160;
  blurCtx = blurCanvas.getContext('2d')!;
}

/** —— Task 71 性能：静态地形/道具合成层 ——
 *  地形与道具两块 2048² 离屏画布每帧各做一次全幅 blit；合并为单张 staticCanvas
 *  后屏幕侧少一次全幅光栅。增量同步靠引擎的 terrainFlushBox/propsFlushBox（设备像素
 *  脏盒，render 消费后清零）；源画布身份变化（新世界/HMR）时全量重合成。 */
let staticCanvas: HTMLCanvasElement | null = null;
let staticCtx: CanvasRenderingContext2D | null = null;
let staticTerrainSrc: HTMLCanvasElement | null = null;
let staticPropsSrc: HTMLCanvasElement | null = null;
function syncStatic(engine: GameEngine) {
  if (!staticCanvas) {
    staticCanvas = document.createElement('canvas');
    staticCanvas.width = engine.terrainCanvas.width;
    staticCanvas.height = engine.terrainCanvas.height;
    staticCtx = staticCanvas.getContext('2d')!;
  }
  const sc = staticCtx!;
  if (staticTerrainSrc !== engine.terrainCanvas || staticPropsSrc !== engine.propsCanvas) {
    staticTerrainSrc = engine.terrainCanvas;
    staticPropsSrc = engine.propsCanvas;
    sc.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
    sc.drawImage(engine.terrainCanvas, 0, 0);
    sc.drawImage(engine.propsCanvas, 0, 0);
    engine.terrainFlushBox = null;
    engine.propsFlushBox = null;
    return;
  }
  const tb = engine.terrainFlushBox;
  engine.terrainFlushBox = null;
  const pb = engine.propsFlushBox;
  engine.propsFlushBox = null;
  if (tb) sc.drawImage(engine.terrainCanvas, tb.x, tb.y, tb.w, tb.h, tb.x, tb.y, tb.w, tb.h);
  if (pb) sc.drawImage(engine.propsCanvas, pb.x, pb.y, pb.w, pb.h, pb.x, pb.y, pb.w, pb.h);
}

/** —— Task 71 性能：视口联合清屏状态（用户空间坐标，1024²） ——
 *  worldCanvas 所有绘制均视口剔除（特效最大 ±20 tile）；只需清「当前∪上一帧」视口
 *  （含 22 tile 余量）即可保证视口外永远无残影。默认 zoom 下清屏面积从 100% 降至 ~15%。 */
let lastWcClear: { x0: number; y0: number; x1: number; y1: number } | null = null;

/** 昼夜光影总成（质感工程 v3 改造）：夜间光源辉光 → glowCanvas（屏幕侧 bloom 合成），
 *  建筑窗灯亮芯仍直画 worldCanvas 保锐利；昼夜色调已移至屏幕空间（render 主流程） */
function applyLighting(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  const t = dayTintOf(engine.dayPhase());
  if (t.n < 0.18) return; // 天未黑透不点灯
  ensureGlow();
  const g = glowCtx!;
  g.clearRect(0, 0, 512, 320);
  const glow = Math.min(1, (t.n - 0.15) / 0.5); // 辉光强度随夜色攀升
  const fc = engine.frameCount;
  let budget = 170; // 光源预算：防大火灾/岩浆海拖帧
  // —— 三层光晕色仅随 glow（帧内常量）变化 → 提出循环，免逐建筑拼接字符串 ——
  const haloOuter = `rgba(255,196,110,${(0.16 * glow).toFixed(3)})`;
  const haloMid = `rgba(255,214,140,${(0.22 * glow).toFixed(3)})`;
  const haloInner = `rgba(255,232,170,${(0.26 * glow).toFixed(3)})`;
  // —— 城市灯火：可见建筑亮起暖黄窗 + 微光晕（文明在黑夜里闪耀） ——
  for (const b of engine.buildings) {
    if (budget <= 0) break;
    if (b.x < x0 - 2 || b.x > x1 + 2 || b.y < y0 - 3 || b.y > y1 + 3) continue;
    const civ = engine.civs[b.civ];
    if (!civ || !civ.alive) continue;
    const px = b.x * 2;
    const py = b.y * 2;
    // 光晕（三层矩形软衰减 → glowCanvas，经 bloom 模糊后呈连续渐变）
    g.fillStyle = haloOuter;
    g.fillRect(px - 3, py - 5, 9, 9);
    g.fillStyle = haloMid;
    g.fillRect(px - 2, py - 4, 7, 7);
    g.fillStyle = haloInner;
    g.fillRect(px - 1, py - 3, 5, 5);
    // 窗灯：1-2 格暖黄像素（受击受损的建筑半数熄灯）—— 亮芯直画世界层保锐利
    const bhp = engine.bHp.get(b.i);
    const lit = bhp == null || bhp > (BUILDING_DEFS[b.kind]?.hp ?? 70) * 0.35;
    if (lit) {
      wc.fillStyle = `rgba(255,224,150,${(0.75 + 0.2 * Math.sin((fc + b.i * 7) * 0.05)) * glow})`;
      wc.fillRect(px + 1, py - 3, 1, 1);
      if ((b.i & 1) === 0) wc.fillRect(px, py - 2, 1, 1);
    }
    budget--;
  }
  // —— 火焰光晕：燃烧处橘红摇曳（→ glowCanvas） ——
  for (const i of engine.fireSet) {
    if (budget <= 0) break;
    const x = i % 256;
    const y = (i / 256) | 0;
    if (x < x0 - 2 || x > x1 + 2 || y < y0 - 2 || y > y1 + 2) continue;
    const px = x * 2;
    const py = y * 2;
    const flick = 0.75 + 0.25 * Math.sin((fc + i * 13) * 0.09);
    g.fillStyle = `rgba(255,130,40,${(0.22 * glow * flick).toFixed(3)})`;
    g.fillRect(px - 3, py - 3, 8, 8);
    g.fillStyle = `rgba(255,170,70,${(0.26 * glow * flick).toFixed(3)})`;
    g.fillRect(px - 2, py - 2, 6, 6);
    g.fillStyle = `rgba(255,200,90,${(0.22 * glow * flick).toFixed(3)})`;
    g.fillRect(px - 1, py - 1, 4, 4);
    budget--;
  }
  // —— 岩浆暖光：大地深处的赤色呼吸（哈希门控 1/3 采样；→ glowCanvas） ——
  const terrain = engine.terrain;
  const tx0 = Math.max(0, Math.floor(x0));
  const tx1 = Math.min(255, Math.ceil(x1));
  const ty0 = Math.max(0, Math.floor(y0));
  const ty1 = Math.min(159, Math.ceil(y1));
  for (let y = ty0; y <= ty1 && budget > 0; y++) {
    const row = y * 256;
    for (let x = tx0; x <= tx1; x++) {
      const i = row + x;
      if (terrain[i] !== T.LAVA) continue;
      const h = (i * 2654435761) >>> 0;
      if (h % 3 !== 0) continue;
      const breathe = 0.7 + 0.3 * Math.sin((fc + h % 100) * 0.02);
      const px = x * 2;
      const py = y * 2;
      g.fillStyle = `rgba(255,110,30,${(0.15 * glow * breathe).toFixed(3)})`;
      g.fillRect(px - 3, py - 3, 8, 8);
      g.fillStyle = `rgba(255,160,60,${(0.18 * glow * breathe).toFixed(3)})`;
      g.fillRect(px - 1, py - 1, 4, 4);
      budget--;
    }
  }
  // —— Task 48-B2：夜间萤火虫（草地/森林上空漂浮闪烁的暖绿光点；→ glowCanvas 软光更梦幻） ——
  // 无状态虚拟粒子：8×8 格块哈希门控 + Lissajous 漂移 + 平方正弦锐闪（零内存零维护）
  if (engine.fxPrefs.ambience && t.n > 0.55) {
    const fg = Math.min(1, (t.n - 0.55) / 0.35) * glow; // 夜越深萤越亮
    for (let by = ty0 >> 3; by <= (ty1 >> 3); by++) {
      for (let bx = tx0 >> 3; bx <= (tx1 >> 3); bx++) {
        const bh = ((bx * 73856093) ^ (by * 19349663)) >>> 0;
        if (bh % 100 >= 13) continue; // ~13% 的块有萤
        const cx = bx * 8 + 4;
        const cy = by * 8 + 4;
        // 块中心须为草地/森林（萤火虫栖于植被）
        const tt = terrain[(cy | 0) * 256 + (cx | 0)];
        if (tt !== T.GRASS && tt !== T.FOREST) continue;
        // Lissajous 慢漂移（双频正交正弦 = 自然游走轨迹）
        const wx = cx + Math.sin(fc * 0.011 + bh % 10) * 2.8;
        const wy = cy + Math.cos(fc * 0.007 + (bh >> 4) % 10) * 2.2;
        // 锐闪：平方正弦（大部分时间暗，偶尔亮起一瞬）
        const blink = Math.max(0, Math.sin(fc * 0.045 + bh % 20));
        const b2 = blink * blink;
        if (b2 < 0.12) continue;
        const px = wx * 2;
        const py = wy * 2;
        const a = (0.55 * b2 * fg).toFixed(3);
        // 微光晕 + 亮芯（暖绿；bloom 后呈真实萤光）
        g.fillStyle = `rgba(150,220,90,${(0.16 * b2 * fg).toFixed(3)})`;
        g.fillRect(px - 1.5, py - 1.5, 3, 3);
        g.fillStyle = `rgba(210,255,140,${a})`;
        g.fillRect(px - 0.5, py - 0.5, 1, 1);
      }
    }
  }
}

/** 云影：云团在地面投下随风漂移的暗斑（太阳方位驱动偏移；与云本体共用漂移相位）
 *  只在白天太阳有一定高度时投影 —— 夜云无影 */
function drawCloudShadows(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  const sun = sunCached(engine);
  if (sun.level < 0.42) return;
  const nat = engine.nature;
  const fc = engine.frameCount;
  const offX = Math.round(sun.sx * sun.len * 5);
  const offY = Math.round(sun.sy * sun.len * 2.5);
  const a = 0.05 + (1 - sun.level) * 0.10;
  const cx0 = Math.max(0, (x0 / CELL) | 0);
  const cx1 = Math.min(AW - 1, (x1 / CELL) | 0);
  const cy0 = Math.max(0, (y0 / CELL) | 0);
  const cy1 = Math.min(AH - 1, (y1 / CELL) | 0);
  wc.fillStyle = `rgba(18,26,44,${a.toFixed(3)})`;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const i = cy * AW + cx;
      const m = nat.moist[i];
      if (m <= 0.62) continue;
      const [u] = nat.windAt(cx, cy);
      const driftX = Math.sin(fc * 0.008 + cx * 0.9) * 3 + Math.sign(u) * Math.min(4, Math.abs(u) * 5);
      const driftY = Math.cos(fc * 0.006 + cy * 0.7) * 1.5;
      const px = cx * CELL * 2 + 2 + driftX + offX;
      const py = cy * CELL * 2 + 2 + driftY + offY;
      wc.fillRect(px, py, 9, 5);
      wc.fillRect(px + 3, py - 3, 6, 3);
      wc.fillRect(px + 6, py + 4, 7, 3);
    }
  }
}

/** 动态战线（战时虚国界）：占领格画国色斜纹覆盖 —— 强度越高越实，临界闪白。
 *  与政治版图的双重国界：主权色（terrain 层）之上叠占领方虚界，战争地理一目了然 */
function drawFrontline(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  if (engine.occSet.size === 0) return;
  const fc = engine.frameCount;
  for (const i of engine.occSet) {
    const x = i % 256;
    const y = (i / 256) | 0;
    if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue;
    const oc = engine.occCiv[i];
    if (oc < 0) continue;
    const civ = engine.civs[oc];
    if (!civ || !civ.alive) continue;
    const str = engine.occStr[i];
    const px = x * 4;
    const py = y * 4;
    // 国色底：强度映射透明度（0.24 → 0.62 —— 推进中越来越实）
    wc.globalAlpha = 0.24 + str * 0.0038;
    wc.fillStyle = civ.colorHex;
    wc.fillRect(px, py, 4, 4);
    wc.globalAlpha = 1;
    // 斜纹（军事占领的"虚界"语义）：主对角线，高强度补反向对角成交叉纹
    wc.fillStyle = 'rgba(255,255,255,0.34)';
    wc.fillRect(px, py, 1, 1);
    wc.fillRect(px + 1, py + 1, 1, 1);
    wc.fillRect(px + 2, py + 2, 1, 1);
    wc.fillRect(px + 3, py + 3, 1, 1);
    if (str >= 50) {
      wc.fillRect(px + 3, py, 1, 1);
      wc.fillRect(px + 2, py + 1, 1, 1);
      wc.fillRect(px + 1, py + 2, 1, 1);
      wc.fillRect(px, py + 3, 1, 1);
    }
    // 临界闪白（即将易帜的战线前沿）
    if (str >= 80 && fc % 30 < 15) {
      wc.fillStyle = 'rgba(255,255,255,0.55)';
      wc.fillRect(px, py, 4, 1);
    }
    // 深色描边底（与背景分离，虚界清晰可读）
    if (str >= 60) {
      wc.fillStyle = 'rgba(20,16,12,0.4)';
      wc.fillRect(px, py, 4, 1);
    }
  }
}

/** —— Task 48-B2：建筑炊烟（健康住宅的烟囱冒烟，风驱漂移） ——
 *  在动态层 B（×2 坐标）绘制；只画住宅/首都（有烟囱的房子）；预算上限防巨城拖帧
 *  烟色查表：上升相位量化 8 档 —— 免逐烟 rgba 字符串拼接 */
const SMOKE_STYLES = Array.from({ length: 8 }, (_, k) => {
  const ph = k / 8;
  const a = 0.3 * (1 - ph) * (1 - ph * 0.4);
  return a > 0.02 ? `rgba(206,202,196,${a.toFixed(3)})` : '';
});

function drawChimneySmoke(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  const fc = engine.frameCount;
  let budget = 220;
  for (const b of engine.buildings) {
    if (budget <= 0) break;
    if (b.kind !== 1 && b.kind !== 2) continue; // 住宅 / 首都
    if (b.x < x0 - 3 || b.x > x1 + 3 || b.y < y0 - 6 || b.y > y1 + 3) continue;
    const civ = engine.civs[b.civ];
    if (!civ || !civ.alive) continue;
    // 受损建筑已有专门的损毁冒烟，健康建筑才炊烟
    const bhp = engine.bHp.get(b.i);
    if (bhp != null && bhp < (BUILDING_DEFS[b.kind]?.hp ?? 70) * 0.6) continue;
    const h = (b.i * 2654435761) >>> 0;
    // 烟囱口（屋顶右上角）
    const cx = b.x * 2 + 2.2;
    const cy = b.y * 2 - 4;
    // 当地风场（平流方向）
    const [wu] = engine.nature.windAt((b.x / 8) | 0, (b.y / 8) | 0);
    for (let k = 0; k < 2; k++) {
      const phF = ((fc * 0.42 + h + k * 21) % 42) / 42; // 0..1 上升相位
      const pi = Math.min(7, (phF * 8) | 0); // 量化档位（颜色查表）
      const style = SMOKE_STYLES[pi];
      if (!style) continue;
      const ph = pi / 8 + 0.0625; // 档位中心相位（几何用）
      const rise = ph * 6.5;
      const sway = Math.sin(fc * 0.02 + h * 0.13 + k * 1.7) * (0.6 + ph * 1.8);
      const px = cx + sway + wu * ph * 5.5;
      const py = cy - rise;
      const s = 0.9 + ph * 1.6; // 烟团随高度膨胀
      wc.fillStyle = style;
      wc.fillRect(px - s / 2, py - s / 2, s, s);
    }
    budget--;
  }
}

/** —— Task 48-B1：脚印（雪/沙/湿地面渐消足迹，在 decals 之下、单位之下） —— */
/** 脚印颜色查表：寿命量化 8 档 × 3 种地面 —— 免逐印 rgba 字符串拼接（420 印 × 60fps 的 GC 压力） */
const FP_COLORS: string[][] = [
  // 雪：青灰凹痕
  Array.from({ length: 8 }, (_, k) => `rgba(104,124,148,${(0.52 * (1 - k / 8)).toFixed(3)})`),
  // 沙：深沙
  Array.from({ length: 8 }, (_, k) => `rgba(120,96,58,${(0.46 * (1 - k / 8)).toFixed(3)})`),
  // 湿地：深泥
  Array.from({ length: 8 }, (_, k) => `rgba(74,60,44,${(0.5 * (1 - k / 8)).toFixed(3)})`),
];
const FP_SNOW_EDGE = Array.from({ length: 8 }, (_, k) => `rgba(235,242,250,${(0.35 * (1 - k / 8)).toFixed(3)})`);

function drawFootprints(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  const fps = engine.footprints;
  for (let k = 0; k < fps.length; k++) {
    const fp = fps[k];
    if (fp.x < x0 - 2 || fp.x > x1 + 2 || fp.y < y0 - 2 || fp.y > y1 + 2) continue;
    const life = 1 - fp.age / GameEngine.FP_TTL;
    if (life <= 0) continue;
    // 质感工程 v3：吸附到整数设备像素（1/4 精灵格）—— 脚印是地面 decal，必须锐利
    const bx = Math.round(fp.x * 8) / 4;
    const by = Math.round(fp.y * 8) / 4;
    // 左右脚交替：位置哈希决定本印偏左还是偏右（±0.5 = 2 设备像素，保持整数对齐）
    const side = (((fp.x * 131 + fp.y * 37) | 0) & 1) === 1 ? 0.5 : -0.5;
    // 颜色查表（寿命 8 档量化）
    const li = Math.min(7, ((1 - life) * 8) | 0);
    const ci = fp.t === T.SNOW ? 0 : fp.t === T.SAND ? 1 : 2;
    wc.fillStyle = FP_COLORS[ci][li];
    wc.fillRect(bx + side, by, 1, 1);
    if (fp.t === T.SNOW && life > 0.55) {
      // 新鲜雪印：边缘挤起的雪痕
      wc.fillStyle = FP_SNOW_EDGE[li];
      wc.fillRect(bx + side - 1, by - 0.75, 1, 0.75);
    }
  }
}

/** —— Task 48-B2：鸟群（迁徙鸟斜掠天空：V 字队形 + 双帧扇翅 + 前后错位扑翼相位） —— */
function drawBirds(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  const fc = engine.frameCount;
  for (const f of engine.flocks) {
    if (f.x < x0 - 14 || f.x > x1 + 14 || f.y < y0 - 14 || f.y > y1 + 14) continue;
    const mag = Math.hypot(f.vx, f.vy) || 1;
    const dirX = f.vx / mag;
    const dirY = f.vy / mag;
    for (let i = 0; i < f.n; i++) {
      // V 字队形：第 i 只在飞行方向后 i 步，横向左右交替展开
      const back = i * 1.05;
      const spread = (i & 1 ? 1 : -1) * Math.ceil(i / 2) * 0.85;
      // 质感工程 v3：吸附到 1/4 精灵格（整数设备像素）—— 鸟群剪影锐利
      const px = Math.round((f.x - dirX * back - dirY * spread) * 8) / 4;
      const py = Math.round((f.y - dirY * back + dirX * spread) * 8) / 4;
      // 扑翼：每只鸟相位错开（i*3），两帧一扇
      const flap = ((fc >> 2) + i * 3) & 1;
      wc.fillStyle = 'rgba(44,44,52,0.88)';
      wc.fillRect(px, py - flap * 0.5, 1, 1); // 身体（扇翅时略升）
      // 翅膀：扇起时左右张开两点，收拢时贴身一点
      if (flap) {
        wc.fillStyle = 'rgba(58,58,68,0.8)';
        wc.fillRect(px - 1, py - 0.5, 1, 0.5);
        wc.fillRect(px + 1, py - 0.5, 1, 0.5);
      }
    }
  }
}

/** —— Task 48-B2：闪电（强风暴上空的锯齿电弧；自发光 —— 画在昼夜光影之后照亮夜空） —— */
function drawBolts(engine: GameEngine, wc: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) {
  if (engine.bolts.length === 0) return;
  const fc = engine.frameCount;
  wc.save();
  wc.globalCompositeOperation = 'lighter';
  for (const b of engine.bolts) {
    if (b.x < x0 - 16 || b.x > x1 + 16 || b.y < y0 - 20 || b.y > y1 + 16) continue;
    const t = b.age / b.ttl;
    // 亮芯三段式：0-12% 全亮 → 12-30% 闪烁衰减 → 余辉
    let a: number;
    if (t < 0.12) a = 1;
    else if (t < 0.3) a = (1 - (t - 0.12) / 0.18) * (Math.sin(fc * 2.6) > 0 ? 1 : 0.45);
    else a = Math.max(0, 0.5 * (1 - (t - 0.3) / 0.7));
    if (a <= 0.02) continue;
    const segs = b.segs;
    // 电弧折线：白青亮芯 + 淡蓝辉光（双层 stroke 模拟 bloom）
    wc.strokeStyle = `rgba(150,190,255,${(0.3 * a).toFixed(3)})`;
    wc.lineWidth = 2.2;
    wc.beginPath();
    let started = false;
    for (let s = 0; s < segs.length; s += 4) {
      // 主干连续段（分叉段独立起笔）
      if (!started || s > 0 && segs[s] === segs[s - 2] && segs[s + 1] === segs[s - 1]) {
        wc.moveTo(segs[s] * 2, segs[s + 1] * 2);
        started = true;
      }
      wc.lineTo(segs[s + 2] * 2, segs[s + 3] * 2);
    }
    wc.stroke();
    wc.strokeStyle = `rgba(245,250,255,${(0.95 * a).toFixed(3)})`;
    wc.lineWidth = 0.9;
    wc.stroke(); // 复用同一路径描细芯（beginPath 未重开 → 零额外几何构造成本）
    // 落点辉光：地面炸开的光斑
    wc.fillStyle = `rgba(200,220,255,${(0.22 * a).toFixed(3)})`;
    wc.fillRect(b.x * 2 - 2.5, b.y * 2 - 1, 5, 2.5);
  }
  wc.restore();
}

export function render(engine: GameEngine, ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  engine.flushDirty();
  engine.flushProps();

  // P0-B：特效密度档位帧首同步（粒子池上限/生成量缩放读数字，免热路径取对象）
  engineFxTier = engine.fxPrefs.fxDensity ?? 1;

  // Task 48-B2：视口尺寸回写（闪电屏闪/鸟群生成的可见性判定；一帧延迟可忽略）
  engine.viewW = cw;
  engine.viewH = ch;

  const { worldCtx: wc, cam, frameCount } = engine;
  const zoom = cam.zoom;

  // visible tile window (for culling) —— Task 71 提前到清屏之前（清屏范围依赖视口）
  const halfW = cw / zoom / 2 + 3;
  const halfH = ch / zoom / 2 + 3;
  const x0 = cam.x - halfW;
  const x1 = cam.x + halfW;
  const y0 = cam.y - halfH;
  const y1 = cam.y + halfH;

  // ---- 1. compose the dynamic world canvas（质感工程 v3：×2 超采样，用户空间仍 1024²） ----
  // 地形/道具层移出合成 → 直绘屏幕；合成画布只承载动态内容。
  wc.setTransform(2, 0, 0, 2, 0, 0); // 基变换：既有绘制坐标零改动（1024 用户空间 → 2048 设备）
  // —— Task 71 性能：视口联合清屏（当前 ∪ 上一帧视口 + 22 tile 余量，用户空间 4px/tile） ——
  // 旧版每帧全清 2048×1280（2.6M 像素）；默认 zoom 4.5 视口仅占 ~15%，暂停/漫游时清屏
  // 开销大幅下降。首帧（无上帧记录）保守全清。注：覆盖层为全幅重绘，不受部分清屏影响。
  {
    const m = 22 * 4;
    const vx0 = Math.max(0, Math.floor(x0 * 4) - m);
    const vy0 = Math.max(0, Math.floor(y0 * 4) - m);
    const vx1 = Math.min(W2, Math.ceil(x1 * 4) + m);
    const vy1 = Math.min(H2, Math.ceil(y1 * 4) + m);
    const pv = lastWcClear;
    if (pv) {
      wc.clearRect(
        Math.min(vx0, pv.x0), Math.min(vy0, pv.y0),
        Math.max(vx1, pv.x1) - Math.min(vx0, pv.x0), Math.max(vy1, pv.y1) - Math.min(vy0, pv.y0),
      );
    } else {
      wc.clearRect(0, 0, W2, H2);
    }
    lastWcClear = { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
  }
  wc.imageSmoothingEnabled = false;

  // —— Task 71 性能：静态地形/道具合成层增量同步（消费引擎脏盒） ——
  syncStatic(engine);

  // 地图覆盖层（政治版图/温度/湿度）：脏时重绘离屏层，半透明合成在地形之上
  // （地形已移屏幕侧：此层随 worldCanvas 整体叠在地形之上，层级不变）
  if (engine.overlayMode !== 'none') {
    if (engine.overlayDirty) engine.redrawOverlay();
    wc.globalAlpha = 0.62;
    wc.drawImage(engine.overlayCanvas, 0, 0); // 自然尺寸 1024×640 = 用户空间满幅
    wc.globalAlpha = 1;
  }

  // visible tile window 已在函数开头计算（Task 71 清屏依赖）

  // —— 动态战线（战时虚国界：×4 坐标，主权之上的第二国界）——
  if (engine.occSet.size > 0) {
    drawFrontline(engine, wc, x0, x1, y0, y1);
  }

  // —— 地幕粒子层（质感工程 v3：512² 低分辨率 —— 浪花/飘雪/扬尘/河 flow/云影/湿沙）
  // 旧管线画在 2048 超采样层上（16 倍光栅浪费）；粒子是无定形软点，低分即可 ——
  // 屏幕侧紧随地形 blit 之后合成，居建筑/单位之下，层级与旧管线一致。
  ensureFx();
  const g = groundCtx!;
  // Task 71 性能：groundUsed 门控 —— 所有粒子源都关闭时连清屏带 blit 一起跳过
  const groundUsed =
    engine.fxPrefs.ambience ||
    (engine.fxPrefs.riverFlow && engine.riverTiles.size > 0) ||
    (engine.fxPrefs.dayNight && engine.laws.atmosphere) ||
    engine.wet.size > 0;
  if (groundUsed) g.clearRect(0, 0, 512, 320);
  // 环境氛围粒子（浪花/飘雪/扬尘/岩浆气泡/深海微澜）
  if (engine.fxPrefs.ambience) {
    drawAmbience(engine, g, x0, x1, y0, y1);
  }

  // 河道水流动画（在 props 之上、建筑之下）
  if (engine.fxPrefs.riverFlow && engine.riverTiles.size > 0) {
    drawRiverFlow(engine, g, x0, x1, y0, y1);
  }

  // 云影（太阳方位驱动的地面暗斑：画在内容之下 —— 阴影落在地上而非物上）
  if (engine.fxPrefs.dayNight && engine.laws.atmosphere) {
    drawCloudShadows(engine, g, x0, x1, y0, y1);
  }

  // 共享太阳状态（建筑/单位阴影同源 —— 全场一根光轴；帧级缓存免重复计算）
  const sun = engine.fxPrefs.dayNight ? sunCached(engine) : null;

  // 湿沙印记：海啸退潮后短暂留存的深色沙滩（原子级时间反馈）
  if (engine.wet.size > 0) {
    for (const i of engine.wet.keys()) {
      const bx = i % 256;
      const by = (i / 256) | 0;
      if (bx < x0 - 1 || bx > x1 + 1 || by < y0 - 1 || by > y1 + 1) continue;
      g.fillStyle = 'rgba(122,100,58,0.4)';
      g.fillRect(bx * 2, by * 2, 2, 2);
      // 水洼反光点
      if (((i * 2654435761) >>> 0) % 5 === 0 && frameCount % 40 < 20) {
        g.fillStyle = 'rgba(190,220,240,0.5)';
        g.fillRect(bx * 2, by * 2, 1, 1);
      }
    }
  }

  // buildings（超细粒度：4px/格 ×4 坐标）
  for (const b of engine.buildings) {
    if (b.x < x0 - 2 || b.x > x1 + 2 || b.y < y0 - 3 || b.y > y1 + 3) continue;
    const civ = engine.civs[b.civ];
    if (!civ || !civ.alive) continue;
    // —— 建筑投影：太阳方位驱动（晨昏长影/正午短影 —— 村落有了体积感） ——
    if (sun) {
      const sox = Math.round(sun.sx * sun.len * 3);
      const soy = Math.round(sun.sy * sun.len * 2);
      wc.fillStyle = sunBldShadowStyle; // 帧级常量字符串（仅随太阳高度变化）
      wc.fillRect(b.x * 4 + 4 + sox, b.y * 4 - 4 + soy, 6, 4);
    }
    // —— 耐久比率先算（P2 城墙受损变暗 + 冒烟共用；缺省 = 满血） ——
    const bhp = engine.bHp.get(b.i);
    const bMax = BUILDING_DEFS[b.kind]?.hp ?? 70;
    const bRatio = bhp != null ? bhp / bMax : 1;
    drawBuilding(wc, b, civ.color, engine.houseTierOf(civ), bRatio);
    // —— 原子级：受损建筑冒烟（耐久 <60% 轻烟，<30% 浓烟 + 火点）——
    if (bhp != null) {
      const ratio = bRatio;
      if (ratio < 0.6) {
        const heavy = ratio < 0.3;
        const flick = ((frameCount >> 2) + b.i) & 3;
        // 烟柱：交替上升的灰色像素
        const sx = b.x * 4 + 2 + ((b.i % 3) - 1) * 2;
        const sy = b.y * 4 - 8;
        for (let k = 0; k < (heavy ? 3 : 2); k++) {
          const ph = (flick + k) & 3;
          wc.fillStyle = heavy ? 'rgba(70,64,58,0.75)' : 'rgba(110,104,96,0.6)';
          wc.fillRect(sx + (ph === 1 ? 2 : ph === 3 ? -2 : 0), sy - k * 4 - (ph >> 1) * 2, 4 - (k > 1 ? 2 : 0), 2);
        }
        // 浓烟顶端火点闪烁
        if (heavy && frameCount % 8 < 4) {
          wc.fillStyle = '#ff9b2d';
          wc.fillRect(sx, sy - 14, 2, 2);
        }
        // 建筑本体裂纹警示
        wc.fillStyle = 'rgba(20,16,12,0.55)';
        wc.fillRect(b.x * 4 + 2, b.y * 4 - 4, 2, 4);
        if (heavy) wc.fillRect(b.x * 4 + 6, b.y * 4 - 2, 2, 2);
      }
    }
  }

  // —— 动态层 B（×2 精灵坐标系）：单位/特效/天气/光影 ——
  wc.save();
  wc.scale(2, 2);
  // Task 48-B2：炊烟（住宅烟囱，风驱漂移；在火焰/单位之下）
  if (engine.fxPrefs.ambience && engine.buildings.length > 0) {
    drawChimneySmoke(engine, wc, x0, x1, y0, y1);
  }
  // fire
  for (const i of engine.fireSet) {
    const x = i % 256;
    const y = (i / 256) | 0;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    drawFire(wc, x, y, i, frameCount);
  }

  // ground items（宝物：在单位之下、建筑之上）
  for (const it of engine.items) {
    if (it.x < x0 - 1 || it.x > x1 + 1 || it.y < y0 - 1 || it.y > y1 + 1) continue;
    drawItem(wc, it, frameCount);
  }

  // —— Task 48-B1：脚印（雪/沙/湿地渐消足迹；最底层的地面 decals） ——
  if (engine.footprints.length > 0 && engine.fxPrefs.ambience) {
    drawFootprints(engine, wc, x0, x1, y0, y1);
  }

  // —— 原子级 decals：血迹残留 + 尸骸/石像（在地面之上、单位之下）——
  if (engine.blood.length > 0) {
    for (const bd of engine.blood) {
      if (bd.x < x0 - 2 || bd.x > x1 + 2 || bd.y < y0 - 2 || bd.y > y1 + 2) continue;
      const fade = Math.max(0.25, 1 - bd.age / (GameEngine.BLOOD_TTL * (bd.big ? 1.4 : 1)));
      const bx = Math.round(bd.x * 2);
      const by = Math.round(bd.y * 2);
      // 种子哈希：每处血迹形状固定（3~5 滴，飞溅方向随机）；颜色仅随 decal 变化 → 提出滴循环免重复拼接
      const s = bd.seed;
      const n = bd.big ? 5 : 3;
      wc.fillStyle = bd.big ? `rgba(122,16,16,${0.55 * fade})` : `rgba(158,28,22,${0.5 * fade})`;
      for (let k = 0; k < n; k++) {
        const ox = (((s >> (k * 3)) & 7) - 3) * (bd.big ? 1 : 1);
        const oy = (((s >> (k * 3 + 2)) & 3) - 1);
        const sz = bd.big && k === 0 ? 2 : 1;
        wc.fillRect(bx + ox, by + oy, sz, sz);
      }
    }
  }
  // —— 凤凰灰烬堆：灰堆 + 余烬闪烁 + 烟丝；重生临近时火光渐盛（涅槃倒数可视化的仪式感）——
  if (engine.phoenixAshes.length > 0) {
    for (const a of engine.phoenixAshes) {
      if (a.x < x0 - 2 || a.x > x1 + 2 || a.y < y0 - 2 || a.y > y1 + 2) continue;
      const bx = Math.round(a.x * 2);
      const by = Math.round(a.y * 2);
      const prog = 1 - a.t / GameEngine.PHOENIX_ASH_TTL; // 0→1 涅槃进度
      // 灰堆（三层：宽底 + 中堆 + 顶尖）
      wc.fillStyle = 'rgba(90,87,83,0.9)';
      wc.fillRect(bx - 2, by, 5, 1);
      wc.fillRect(bx - 1, by - 1, 3, 1);
      wc.fillStyle = 'rgba(120,116,110,0.85)';
      wc.fillRect(bx, by - 2, 1, 1);
      // 余烬（随重生临近越来越亮、闪烁越来越急）
      const emberOn = frameCount % Math.max(3, Math.round(10 - prog * 7)) < 2;
      if (emberOn) {
        wc.fillStyle = prog > 0.75 ? '#ffd93d' : '#ff9b2d';
        wc.fillRect(bx - 1 + ((a.x * 91) | 0) % 2, by - 1, 1, 1);
        wc.fillRect(bx + ((a.y * 37) | 0) % 2, by, 1, 1);
      }
      // 顶部火苗渐起（后程；临近重生时白热）
      if (prog > 0.5 && frameCount % 8 < 4) {
        wc.fillStyle = prog > 0.8 ? '#fff3c4' : '#cf3f2e';
        wc.fillRect(bx, by - 3, 1, 1);
      }
      // 烟丝（上升的灰烟，偶现）
      if (frameCount % 20 < 6) {
        wc.fillStyle = 'rgba(140,136,130,0.5)';
        wc.fillRect(bx + ((frameCount >> 3) & 1), by - 4 - ((frameCount >> 4) & 1), 1, 1);
      }
    }
  }
  if (engine.corpses.length > 0) {
    for (const c of engine.corpses) {
      if (c.x < x0 - 2 || c.x > x1 + 2 || c.y < y0 - 2 || c.y > y1 + 2) continue;
      const bx = Math.round(c.x * 2);
      const by = Math.round(c.y * 2);
      const fade = Math.max(0.2, 1 - c.age / (GameEngine.CORPSE_TTL * (c.stone ? 2.2 : 1)));
      if (c.stone) {
        // 蛇怪的石像：灰白人形剪影（头+身+双腿）+ 底座
        wc.fillStyle = `rgba(150,150,150,${0.85 * fade})`;
        wc.fillRect(bx - 1, by - 5, 2, 2); // 头
        wc.fillRect(bx - 1, by - 3, 2, 3); // 身
        wc.fillStyle = `rgba(110,110,110,${0.9 * fade})`;
        wc.fillRect(bx - 2, by, 4, 1); // 底座
        // 石化高光
        wc.fillStyle = `rgba(200,205,210,${0.7 * fade})`;
        wc.fillRect(bx - 1, by - 5, 1, 1);
        if (frameCount % 90 < 45) { wc.fillRect(bx, by - 2, 1, 1); }
      } else {
        // 骸骨堆：白色/暗色骨点组合（头骨+散乱骨片）；亡者为暗色骨尘
        const bone = c.undead ? `rgba(70,64,58,${0.7 * fade})` : `rgba(226,222,212,${0.85 * fade})`;
        wc.fillStyle = bone;
        wc.fillRect(bx - 1, by, 2, 2); // 主骨堆
        wc.fillRect(bx, by - 1, 1, 1); // 头骨点
        const s2 = (c.x * 91 + c.y * 37) | 0;
        wc.fillRect(bx - 2 + (s2 & 1), by + 1, 1, 1);
        wc.fillRect(bx + 1 - (s2 & 1), by - 1, 1, 1);
      }
    }
  }

  // units
  for (const u of engine.units) {
    if (u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
    drawUnitSprite(engine, u, wc);
    // —— 原子级：受损单位头顶血条（受损时才显示；可关闭）——
    // 质感工程 v3：血条/恐慌标记门限 zoom≥4 → zoom≥6（746 单位规模下逐单位标记
    // 是最重的屏幕元素；低倍率时 ~9px 宽的小标记信息密度过低，不值得其成本）
    if (engine.fxPrefs.hpBars && zoom >= 6 && u.hp < u.maxHp && !u.boat) {
      const px = u.dpx ?? (u.rx ?? u.x) * 2;
      const py = u.dpy ?? (u.ry ?? u.y) * 2;
      const w = 4;
      const ratio = Math.max(0, u.hp / u.maxHp);
      wc.fillStyle = 'rgba(20,16,12,0.75)';
      wc.fillRect(px - 1, py - 6, w, 1);
      wc.fillStyle = ratio > 0.5 ? '#5fc65b' : ratio > 0.25 ? '#ffd93d' : '#cf3f2e';
      wc.fillRect(px - 1, py - 6, Math.max(1, Math.round(w * ratio)), 1);
    }
    // —— 涌现社会内核：恐慌头顶标记（≥0.55 示警；≥0.72 溃逃红「!」高频闪烁）——
    // 缩放阈值跟随血条（zoom ≥ 4 才画，小标记不喧宾夺主）；与血条同列时自动上移一行避让
    const pk = u.panic ?? 0;
    if (pk >= 0.55 && zoom >= 6 && !u.boat) {
      const px = u.dpx ?? (u.rx ?? u.x) * 2;
      const py = u.dpy ?? (u.ry ?? u.y) * 2;
      const by = (engine.fxPrefs.hpBars && u.hp < u.maxHp) ? py - 7 : py - 5; // 标记基准底行
      if (pk >= 0.72) {
        if (frameCount % 36 < 26) { // 2/3 占空比闪烁 —— 夺路狂逃的紧迫感
          wc.fillStyle = '#ef4444';
          wc.fillRect(px, by - 3, 1, 2); // 「!」竖条
          wc.fillRect(px, by, 1, 1); // 「!」点（隔一像素，恰避血条行）
        }
      } else {
        wc.fillStyle = '#f59e0b';
        wc.fillRect(px, by - 1, 2, 2); // amber 警示点（不安蔓延中）
      }
    }
    if (u.id === engine.selectedId) {
      // 选中框跟随插值坐标（与精灵本体同步滑动）
      const px = u.dpx ?? (u.rx ?? u.x) * 2;
      const py = u.dpy ?? (u.ry ?? u.y) * 2;
      wc.strokeStyle = 'rgba(255,255,255,0.9)';
      wc.lineWidth = 1;
      if (u.boat) {
        // 选中的殖民船：大一号的选中框
        wc.strokeRect(px - 3, py - 5, 7, 8);
      } else {
        wc.strokeRect(px - 2, py - 3, 5, 6);
      }
    }
  }

  // 战争前线红闪：活跃战斗 tile 画红色脉冲描边（可在画面设置中关闭）
  if (engine.fxPrefs.battleFlash && engine.activeBattles.size > 0) {
    const pulse = Math.sin(frameCount * 0.35) * 0.5 + 0.5; // 0..1 脉冲
    const alpha = 0.35 + pulse * 0.45;
    for (const bi of engine.activeBattles.keys()) {
      const bx = bi % 256;
      const by = (bi / 256) | 0;
      if (bx < x0 - 1 || bx > x1 + 1 || by < y0 - 1 || by > y1 + 1) continue;
      const px = bx * 2 - 1;
      const py = by * 2 - 1;
      wc.fillStyle = `rgba(255,40,30,${alpha * 0.35})`;
      wc.fillRect(px, py, 4, 4);
      wc.strokeStyle = `rgba(255,60,45,${alpha})`;
      wc.lineWidth = 1;
      wc.strokeRect(px + 0.5, py + 0.5, 3, 3);
    }
  }

  // —— 军团方阵：军旗（旗杆 + 飘动三角旗 + 状态标记 + 士气条）——
  if (engine.armies.length > 0) {
    for (const a of engine.armies) {
      if (a.x < x0 - 2 || a.x > x1 + 2 || a.y < y0 - 3 || a.y > y1 + 2) continue;
      drawArmyBanner(engine, a, wc, zoom);
    }
  }

  // —— Task 48-B2：鸟群（迁徙鸟斜掠天空：V 字队形 + 扇翅；在单位之上、天气之下） ——
  if (engine.flocks.length > 0 && engine.fxPrefs.ambience) {
    drawBirds(engine, wc, x0, x1, y0, y1);
  }

  // world-space effects (small pixel ones)
  // 质感工程 v3：绘制上限 160（繁衍潮/大战时特效可达数百 —— 全绘只会拖帧，
  // 取前 160 个即视觉饱满；effects 本身短寿命，不损失信息量）
  let eDrawn = 0;
  for (const e of engine.effects) {
    if (e.x < x0 - 20 || e.x > x1 + 20 || e.y < y0 - 20 || e.y > y1 + 20) continue;
    drawWorldEffect(engine, e, wc);
    if (++eDrawn >= 160) break;
  }

  // —— P0-B：像素粒子池步进+绘制（爆炸火花/血溅/沙尘；上限随 fxDensity 分档）——
  stepFxParticles(wc);

  // —— 天幕粒子层（质感工程 v3：512² 低分辨率 —— 云/雨/雪/气旋/闪电）
  // 画在世界层之上、昼夜光影之下（屏幕侧紧随 worldCanvas 合成；闪电在雨幕之上）
  ensureFx();
  const sk = skyCtx!;
  sk.clearRect(0, 0, 512, 320);
  let skyUsed = false;
  if (engine.fxPrefs.ambience && engine.laws.atmosphere) {
    drawWeather(engine, sk, x0, x1, y0, y1);
    skyUsed = true;
  }
  if (engine.bolts.length > 0) {
    drawBolts(engine, sk, x0, x1, y0, y1);
    skyUsed = true;
  }

  // —— 昼夜光影总成（质感工程 v3：夜间辉光 → glowCanvas，屏幕侧 bloom 合成）
  if (engine.fxPrefs.dayNight) {
    applyLighting(engine, wc, x0, x1, y0, y1);
  }

  // （闪电已移至天幕层 sk —— 画在雨幕之上、昼夜色调之下）

  wc.restore(); // —— 动态层 B 结束 ——

  // ---- 2. blit to the screen ----
  const dpr = ctx.canvas.width / cw;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = DEEP_BG;
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = false;

  const shakeAmp = engine.shake;
  const sx = shakeAmp > 0.3 ? Math.sin(frameCount * 2.1) * shakeAmp : 0;
  const sy = shakeAmp > 0.3 ? Math.cos(frameCount * 2.7) * shakeAmp : 0;

  const scale = zoom / 8; // 质感工程 v3：超采样画布（2048²）—— 每格屏幕尺寸不变（zoom CSS px），取景零变化
  const ox = cw / 2 - cam.x * zoom + sx;
  const oy = ch / 2 - cam.y * zoom + sy;
  // —— P1 性能：worldCanvas/staticCanvas blit 视口裁剪 ——
  // 旧版每帧全幅 drawImage 两次（2048×1280 ≈ 2.6M 像素 ×2）；改为 9 参形式，
  // 源矩形 = 当前视口 ∩ 画布。默认 zoom 4.5 视口仅占画布 ~15% → 光栅量降 ~85%。
  // k = 8/zoom：画布设备像素 / CSS px（画布 8 设备像素每 tile，zoom CSS px 每 tile）
  const kInv = 8 / zoom;
  const blitX0 = Math.max(0, Math.floor(-ox * kInv));
  const blitY0 = Math.max(0, Math.floor(-oy * kInv));
  const blitX1 = Math.min(W2 * 2, Math.ceil((cw - ox) * kInv));
  const blitY1 = Math.min(H2 * 2, Math.ceil((ch - oy) * kInv));
  const blitClipped = blitX1 > blitX0 && blitY1 > blitY0;
  // 缩放动画期间临时双线性：推拉镜头平滑无摩尔纹；静止回最近邻保持像素锐利
  const zoomSmoothing = engine.zoomAnim != null;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  ctx.imageSmoothingEnabled = zoomSmoothing;
  // Task 71 性能：地形+道具预合成 staticCanvas（syncStatic 增量维护）→ 单次裁剪 blit
  if (blitClipped) {
    ctx.drawImage(staticCanvas!, blitX0, blitY0, blitX1 - blitX0, blitY1 - blitY0, blitX0, blitY0, blitX1 - blitX0, blitY1 - blitY0);
  }
  // 地幕粒子层（浪花/飘雪/云影/湿沙：地形之上、建筑单位之下；全关时跳过）
  if (groundUsed) {
    ctx.setTransform(dpr * zoom / 2, 0, 0, dpr * zoom / 2, dpr * ox, dpr * oy);
    ctx.drawImage(groundCanvas!, 0, 0);
  }
  // 世界层（建筑/单位/特效：超采样主合成，同样视口裁剪）
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  if (blitClipped) {
    ctx.drawImage(engine.worldCanvas, blitX0, blitY0, blitX1 - blitX0, blitY1 - blitY0, blitX0, blitY0, blitX1 - blitX0, blitY1 - blitY0);
  }
  // 天幕粒子层（云/雨/雪/闪电：世界层之上、昼夜色调之下；空幕跳过省一次全屏 blit）
  if (skyUsed) {
    ctx.setTransform(dpr * zoom / 2, 0, 0, dpr * zoom / 2, dpr * ox, dpr * oy);
    ctx.drawImage(skyCanvas!, 0, 0);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // —— 昼夜色调（质感工程 v3：移至屏幕空间 multiply —— 覆盖直绘屏幕的地形/道具/世界层全体；
  //    只填世界矩形投影，画布黑边不再被染色） ——
  let nightOn = false;
  if (engine.fxPrefs.dayNight) {
    const tint = dayTintOf(engine.dayPhase());
    if (tint.a > 0.01) {
      const rx0 = Math.max(0, ox);
      const ry0 = Math.max(0, oy);
      const rx1 = Math.min(cw, ox + (W2 / 4) * zoom);
      const ry1 = Math.min(ch, oy + (H2 / 4) * zoom);
      if (rx1 > rx0 && ry1 > ry0) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${tint.a})`;
        ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // —— 夜间辉光 bloom：glowCanvas(512²) → blurCanvas(256²) 降采样，
    //    屏幕 lighter 加性合成 = 真·软渐变光晕（灯火/火焰/岩浆/萤火在黑夜里流淌） ——
    if (tint.n >= 0.18) {
      nightOn = true;
    }
  }
  if (nightOn) {
    ensureGlow();
    const bc = blurCanvas!;
    const bctx = blurCtx!;
    bctx.clearRect(0, 0, 256, 160);
    bctx.imageSmoothingEnabled = true;
    bctx.drawImage(glowCanvas!, 0, 0, 256, 160);
    ctx.globalCompositeOperation = 'lighter';
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * ox, dpr * oy);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(bc, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // —— 火山灰幕墙（屏幕空间：无夏之年的苍茫滤色）——
  if (engine.nature.ash > 0.08) {
    ctx.fillStyle = `rgba(96, 88, 78, ${Math.min(0.34, engine.nature.ash * 0.32)})`;
    ctx.fillRect(0, 0, cw, ch);
  }

  // 世界坐标 → 屏幕坐标（Task 42-a：原 wts 闭包每次调用返回新对象 —— 陨石尾迹/伤害数字/触发器高频
  // 路径改为帧内常量基（wox/woy 已含镜头与震屏偏移）直接线性映射，零闭包零对象分配）
  const wox = cw / 2 + sx - cam.x * zoom;
  const woy = ch / 2 + sy - cam.y * zoom;

  // ---- 3. screen-space effects ----
  for (const e of engine.effects) {
    if (e.kind === 'meteor') {
      const t = Math.min(1, e.age / e.ttl);
      const ex0 = e.x0 ?? e.x;
      const ey0 = e.y0 ?? e.y;
      const wx = ex0 + (e.x - ex0) * t;
      const wy = ey0 + (e.y - ey0) * t;
      const pxx = wx * zoom + wox;
      const pyy = wy * zoom + woy;
      const s = Math.max(3, zoom * 1.4);
      // trail
      for (let k = 1; k <= 5; k++) {
        const tt = Math.max(0, t - k * 0.05);
        const tx = ex0 + (e.x - ex0) * tt;
        const ty = ey0 + (e.y - ey0) * tt;
        const tpx = tx * zoom + wox;
        const tpy = ty * zoom + woy;
        ctx.fillStyle = k % 2 ? '#ff9b2d' : '#ffd93d';
        ctx.globalAlpha = 1 - k * 0.17;
        ctx.fillRect(Math.round(tpx), Math.round(tpy), Math.max(2, s - k), Math.max(2, s - k));
      }
      ctx.globalAlpha = 1;
      // fireball
      ctx.fillStyle = '#ffd93d';
      ctx.fillRect(Math.round(pxx), Math.round(pyy), Math.round(s), Math.round(s));
      ctx.fillStyle = '#ff9b2d';
      ctx.fillRect(Math.round(pxx - s * 0.3), Math.round(pyy - s * 0.3), Math.round(s * 1.3), Math.round(s * 0.6));
    } else if (e.kind === 'flash') {
      ctx.fillStyle = `rgba(255,255,245,${Math.max(0, 1 - e.age / e.ttl)})`;
      ctx.fillRect(0, 0, cw, ch);
    } else if (e.kind === 'dmg' && e.text && engine.fxPrefs.dmgNumbers) {
      // 伤害数字：向上漂浮 + 淡出，前 1/3 悬停、后 2/3 上升
      const t = e.age / e.ttl;
      const rise = t < 0.3 ? 0 : (t - 0.3) / 0.7 * 26;
      const alpha = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.25);
      const dpx = e.x * zoom + wox;
      const dpy = e.y * zoom + woy - 10 - rise;
      const crit = e.text.indexOf('暴') >= 0;
      const poison = e.text.indexOf('毒') >= 0;
      // —— P0-B：像素点阵数字（3×5 字模 fillRect；暴击 ×1.5 放大 + 金色）——
      // 纯中文文本（吞噬/石化/装备名等点阵无法表达）回退系统字体
      const s0 = Math.max(1, Math.min(3, Math.round(zoom / 4)));
      const s = crit ? Math.round(s0 * 1.5) : s0;
      const col = poison ? `rgba(120,220,80,${alpha})` : crit ? `rgba(255,217,61,${alpha})` : `rgba(255,170,60,${alpha})`;
      let hasDigit = false;
      for (let k = 0; k < e.text.length; k++) {
        const c = e.text.charCodeAt(k);
        if ((c >= 48 && c <= 57) || c === 45) { hasDigit = true; break; }
      }
      if (hasDigit) {
        // 像素风可读性底衬：1 块深色底板替代逐字描边（点阵数字 ×5 向描边成本过高）
        ctx.globalAlpha = alpha * 0.42;
        ctx.fillStyle = '#14100c';
        let n = 0;
        for (let k = 0; k < e.text.length; k++) {
          const c = e.text.charCodeAt(k);
          if ((c >= 48 && c <= 57) || c === 45) n++;
        }
        ctx.fillRect(dpx - (n * 4 * s - s) / 2 - 2, dpy - 2, n * 4 * s + 2, 5 * s + 3);
        ctx.globalAlpha = alpha;
        drawPixelDigits(ctx, dpx, dpy, e.text, s, col);
        // 暴击标记：数字左侧 2×2 金色闪块（『暴』字点阵无法表达 → 像素记号）
        if (crit && engine.frameCount % 14 < 9) {
          ctx.fillStyle = `rgba(255,238,170,${alpha})`;
          ctx.fillRect(dpx - (n * 4 * s - s) / 2 - 6, dpy, 2, 2);
        }
        ctx.globalAlpha = 1;
      } else {
        const fs = Math.max(9, Math.min(15, Math.round(zoom * 1.6)));
        ctx.font = dmgFontOf(fs);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // 黑色描边保证浅色地形上可读
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(20,16,12,${alpha})`;
        ctx.strokeText(e.text, dpx, dpy);
        ctx.fillStyle = poison ? `rgba(120,220,80,${alpha})` : `rgba(255,170,60,${alpha})`;
        ctx.fillText(e.text, dpx, dpy);
      }
    }
  }

  // —— Task 48-B2：闪电屏闪（年轻电弧在视野内时的瞬时天光 —— 雷暴的临场感） ——
  if (engine.bolts.length > 0) {
    let flash = 0;
    for (const b of engine.bolts) {
      if (b.age > 130) continue;
      // 落点距视野中心的屏幕距离（粗剔除：出屏很远的闪电不闪屏）
      const dx = (b.x - cam.x) * zoom;
      const dy = (b.y - cam.y) * zoom;
      if (Math.abs(dx) > cw * 0.75 || Math.abs(dy) > ch * 0.75) continue;
      flash = Math.max(flash, (1 - b.age / 130) * 0.16);
    }
    if (flash > 0.01) {
      ctx.fillStyle = `rgba(214,228,255,${flash.toFixed(3)})`;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  // ---- 终极世界大战：战场红色暗角（战火年代的呼吸脉冲；摄影模式下隐藏保持画面纯净） ----
  if (engine.worldWar.phase === 'running' && !engine.cinemaMode) {
    const pulse = 0.5 + 0.5 * Math.sin(engine.frameCount / 90);
    ensureScreenGradients(ctx, cw, ch);
    ctx.globalAlpha = 0.12 + pulse * 0.09;
    ctx.fillStyle = screenGradCache.war!;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = 1;
  }

  // ---- 夜幕暗角：入夜后屏幕四周的深蓝晕影（夜色纵深；摄影模式同样生效 —— 夜本身就是画面） ----
  if (engine.fxPrefs.dayNight) {
    const t = dayTintOf(engine.dayPhase());
    // ---- 晨昏天光：太阳方位侧的暖色渐晕（东方既白 / 西天流霞 —— 转场的天空叙事） ----
    const w = t.n > 0.1 ? 1 - Math.abs(2 * t.n - 1) : 0; // 半明半暗时最强
    if (w > 0.15) {
      const isDusk = engine.dayPhase() < 0.7; // 黄昏太阳沉西 / 破晓太阳升东
      drawDawnGlow(ctx, cw, ch, w, !isDusk); // 渐变锚定西侧，破晓水平翻转
    }
    const n = t.n;
    if (n > 0.25) {
      ensureScreenGradients(ctx, cw, ch);
      ctx.globalAlpha = n;
      ctx.fillStyle = screenGradCache.night!;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }
  }

  // ---- 3.5 事件触发器标记（像素级精细化事件控制；摄影模式下隐藏编辑器标记）----
  if (engine.triggers.length > 0 && !engine.cinemaMode) {
    for (const t of engine.triggers) {
      const tpx = t.x * zoom + wox;
      const tpy = t.y * zoom + woy;
      const rr = t.r * zoom;
      // 可视范围虚线圆（enter 条件区域；最小可视半径 6px 保证缩小时仍可见）
      const rv = Math.max(6, rr);
      ctx.beginPath();
      ctx.arc(tpx, tpy, rv, 0, Math.PI * 2);
      ctx.strokeStyle = t.enabled ? 'rgba(255,213,61,0.75)' : 'rgba(120,120,120,0.5)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      // 中心闪电像素图标（5x7 像素画，enabled 金色 / disabled 灰色；呼吸动画提示活跃）
      const pulse = t.enabled ? 0.75 + 0.25 * Math.sin(engine.frameCount / 24) : 0.55;
      const z = Math.max(1.2, Math.min(3.2, zoom / 6.4));
      const px = Math.round(tpx);
      const py = Math.round(tpy);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = t.enabled ? '#ffd93d' : '#8a8a8a';
      // ⚡ 形状的像素块（列偏移, 行偏移, 宽, 高）
      ctx.fillRect(px + Math.round(2 * z), py - Math.round(6 * z), Math.round(1.4 * z), Math.round(3 * z));
      ctx.fillRect(px + Math.round(1 * z), py - Math.round(3 * z), Math.round(1.4 * z), Math.round(2 * z));
      ctx.fillRect(px, py - Math.round(1 * z), Math.round(1.4 * z), Math.round(2 * z));
      ctx.fillRect(px + Math.round(1 * z), py + Math.round(1 * z), Math.round(1.4 * z), Math.round(2 * z));
      ctx.fillRect(px + Math.round(2 * z), py + Math.round(3 * z), Math.round(1.4 * z), Math.round(3 * z));
      // 描边底色提升浅色地形上的对比度
      ctx.globalAlpha = pulse * 0.5;
      ctx.fillStyle = '#14100c';
      ctx.fillRect(px + Math.round(2 * z), py - Math.round(6.8 * z), Math.round(1.8 * z), Math.round(0.8 * z));
      ctx.globalAlpha = 1;
    }
  }

  // ---- 3.6 地图选点模式十字准星（新建/编辑触发器时从地图拾取坐标）----
  if (engine.cursor.on && engine.pickMode) {
    const cpx = engine.cursor.wx * zoom + wox;
    const cpy = engine.cursor.wy * zoom + woy;
    ctx.strokeStyle = 'rgba(255,213,61,0.9)';
    ctx.lineWidth = 1;
    const arm = 14;
    const gap = 4;
    ctx.beginPath();
    ctx.moveTo(cpx - arm, cpy); ctx.lineTo(cpx - gap, cpy);
    ctx.moveTo(cpx + gap, cpy); ctx.lineTo(cpx + arm, cpy);
    ctx.moveTo(cpx, cpy - arm); ctx.lineTo(cpx, cpy - gap);
    ctx.moveTo(cpx, cpy + gap); ctx.lineTo(cpx, cpy + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cpx, cpy, 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- 4. brush cursor preview ----
  // P3：像素风短弧段圆环 —— 黑色描边打底（对比）+ 白 60% 虚线感短弧段（两遍同相位叠画）
  if (engine.cursor.on && engine.brushPreview) {
    const bpx = engine.cursor.wx * zoom + wox;
    const bpy = engine.cursor.wy * zoom + woy;
    const r = (engine.previewR ?? engine.brush) * zoom;
    ctx.beginPath();
    ctx.arc(bpx, bpy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    const SEG = 8; // 短弧段数：虚线感（占空比 0.55）
    const span = (Math.PI * 2) / SEG;
    // 第一遍：深色描边（线宽加倍 → 勾边效果，浅色地形上不消失）
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20,16,12,0.5)';
    for (let k = 0; k < SEG; k++) {
      const a0 = k * span;
      ctx.beginPath();
      ctx.arc(bpx, bpy, r, a0, a0 + span * 0.55);
      ctx.stroke();
    }
    // 第二遍：白 60% 短弧段（同相位 —— 骑在黑描边上）
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    for (let k = 0; k < SEG; k++) {
      const a0 = k * span;
      ctx.beginPath();
      ctx.arc(bpx, bpy, r, a0, a0 + span * 0.55);
      ctx.stroke();
    }
  }
}

const W2 = 1024;
const H2 = 640;

/** 军团军旗：旗杆 + 飘动三角旗（国色）+ 状态光环 + 士气条（zoom≥3 时附指挥圈） */
function drawArmyBanner(engine: GameEngine, a: Army, wc: CanvasRenderingContext2D, zoom: number) {
  const civ = engine.civs[a.civ];
  if (!civ || !civ.alive) return;
  const fc = engine.frameCount;
  // Task 48-B3：军旗用帧间插值坐标（行军每 5 tick 一次，直读坐标会 3 次/秒跳变）
  // 质感工程 v3：吸附到 1/4 精灵格（a.ax 已在 frame() 吸附到 1/8 格；此处兜底取整）
  const px = Math.round((a.ax ?? a.x) * 8) / 4;
  const py = Math.round((a.ay ?? a.y) * 8) / 4;

  // 舰队模式：旗下小船体（渡海远征）
  if (a.naval) {
    wc.fillStyle = '#4a3626';
    wc.fillRect(px - 2, py, 5, 2);
    wc.fillStyle = '#7a5c3e';
    wc.fillRect(px - 1, py - 1, 3, 1);
    // 航行尾波
    if (fc % 12 < 6) {
      wc.fillStyle = 'rgba(200,230,255,0.5)';
      wc.fillRect(px - 4, py + 1, 1, 1);
      wc.fillRect(px + 4, py + 1, 1, 1);
    }
  }

  // 状态光环：会战=红脉冲圈 / 围城=橙点环 / 溃退=灰
  if (a.state === 'battle') {
    const pulse = Math.sin(fc * 0.3) * 0.5 + 0.5;
    wc.strokeStyle = `rgba(255,50,35,${0.35 + pulse * 0.4})`;
    wc.lineWidth = 1;
    wc.beginPath();
    wc.arc(px, py, 6 + pulse * 2, 0, Math.PI * 2);
    wc.stroke();
  } else if (a.state === 'siege') {
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + fc * 0.02;
      wc.fillStyle = 'rgba(255,150,50,0.8)';
      wc.fillRect(Math.round(px + Math.cos(ang) * 5), Math.round(py + Math.sin(ang) * 5), 1, 1);
    }
  }

  // 机械化军团标识：金色描边框（机器人学科技 → 军团全面机械化）
  if (engine.techModsOf(a.civ).mech > 0) {
    const mglow = Math.sin(engine.frameCount * 0.15) * 0.15 + 0.6;
    wc.strokeStyle = `rgba(232,193,74,${mglow})`;
    wc.lineWidth = 1;
    wc.strokeRect(px - 3.5, py - 10.5, 8, 13);
  }

  // 旗杆（深色 1px）
  wc.fillStyle = '#241c12';
  wc.fillRect(px, py - 8, 1, 8);
  // 杆顶金珠
  wc.fillStyle = '#e8c14a';
  wc.fillRect(px, py - 9, 1, 1);

  // 三角旗面：4 帧波形飘动（国色 2 列 + 旗尖列）
  const wave = Math.floor(fc / 7) % 4;
  const flagCol = a.state === 'retreat' ? '#70707a' : civ.colorHex;
  const tipCol = a.state === 'retreat' ? '#4a4a52' : 'rgba(255,255,255,0.75)';
  const wob1 = wave === 1 ? 1 : 0;
  const wob2 = wave === 2 ? 1 : wave === 3 ? 1 : 0;
  wc.fillStyle = flagCol;
  wc.fillRect(px + 1, py - 8, 2, 3); // 旗面根部
  wc.fillRect(px + 3, py - 8 + wob1, 1, 2); // 中段
  wc.fillStyle = tipCol;
  wc.fillRect(px + 4, py - 8 + wob1 + wob2, 1, 1); // 旗尖
  // 集结态：白旗尖闪烁（集结信号）
  if (a.state === 'rally' && fc % 16 < 8) {
    wc.fillStyle = '#ffffff';
    wc.fillRect(px + 4, py - 9, 1, 1);
  }

  // 士气条：旗下 3px 宽微型条（绿→黄→红）
  const m = Math.max(0, Math.min(1, a.morale / 100));
  wc.fillStyle = 'rgba(12,10,8,0.8)';
  wc.fillRect(px - 1, py + 2, 5, 1);
  wc.fillStyle = m > 0.5 ? '#5fc65b' : m > 0.3 ? '#ffd93d' : '#cf3f2e';
  wc.fillRect(px - 1, py + 2, Math.max(1, Math.round(5 * m)), 1);

  // 指挥圈（高倍率下显示编队范围感）
  if (zoom >= 8) {
    wc.strokeStyle = `${civ.colorHex}55`;
    wc.lineWidth = 1;
    wc.setLineDash([2, 2]);
    wc.beginPath();
    wc.arc(px, py, 10, 0, Math.PI * 2);
    wc.stroke();
    wc.setLineDash([]);
  }
}

function drawUnitSprite(engine: GameEngine, u: Unit, wc: CanvasRenderingContext2D) {
  // 殖民船优先：航海中的单位画船而非本体
  if (u.boat) {
    const civ = u.civ >= 0 ? engine.civs[u.civ] : null;
    drawBoat(wc, u, civ && civ.alive ? civ.color : null, engine.frameCount);
    return;
  }
  const def = RACES[u.race];
  // 深度打磨：贸易商队 — 满载行商画驮马货车（王国尖旗 + 货物堆）
  if ((u.caravan ?? 0) > 0) {
    const civ = u.civ >= 0 ? engine.civs[u.civ] : null;
    drawCaravan(wc, u, civ && civ.alive ? civ.color : null, engine.frameCount);
    return;
  }
  // —— 深度打磨：统一脚下软阴影（陆行单位半透明椭圆，水生/飞行除外） ——
  // 昼夜开启时升级为方向阴影：随太阳方位偏移拉伸（晨昏长影/正午短影/夜晚月影淡）
  if (!def.aquatic && !def.flying && u.trait !== 'giant') {
    const px = u.dpx ?? (u.rx ?? u.x) * 2;
    const py = u.dpy ?? (u.ry ?? u.y) * 2;
    if (engine.fxPrefs.dayNight) {
      // 帧级缓存：太阳状态与阴影色字符串全帧共享（免每单位对象分配 + 三角函数 + 字符串拼接）
      const s = sunCached(engine);
      const sox = Math.round(s.sx * s.len * 2);
      const soy = Math.round(s.sy * s.len);
      wc.fillStyle = sunUnitShadowStyle;
      wc.fillRect(px - 1 + sox, py + 2 + soy, 3, 1);
      // 晨昏长影：向影子方向再延一像素（拉出影长的层次）
      if (s.len > 1.7) wc.fillRect(px - 1 + sox * 2, py + 2 + soy, 2, 1);
    } else {
      wc.fillStyle = 'rgba(12,9,6,0.22)';
      wc.fillRect(px - 1, py + 2, 3, 1);
    }
  }
  // —— Task 48-B3：幼年体型 —— 新生儿/幼兽个头小，随年龄渐长到成体（锚定脚底）
  // 人形以绝对年龄 4 年为成体；野生动物以 14% 寿限为成体（小鹿/狼崽肉眼可辨）
  if (!def.aquatic && !def.flying) {
    let jk = 1;
    if (def.sprite === 'person') {
      if (u.age < 4) jk = 0.76 + (u.age / 4) * 0.24;
    } else if (u.age < def.maxAge * 0.14) {
      jk = 0.78 + (u.age / (def.maxAge * 0.14)) * 0.22;
    }
    if (jk < 0.995) {
      const px = u.dpx ?? (u.rx ?? u.x) * 2;
      const py = u.dpy ?? (u.ry ?? u.y) * 2;
      wc.save();
      wc.translate(px, py + 3);
      wc.scale(jk, jk);
      wc.translate(-px, -(py + 3));
      drawUnitBody(engine, u, def, wc);
      wc.restore();
      return;
    }
  }
  // —— 深度打磨：侏儒特质 — 身形整体缩小 28%（锚定脚底，步伐频率不变） ——
  if (u.trait === 'tiny' && !def.aquatic) {
    const px = u.dpx ?? (u.rx ?? u.x) * 2;
    const py = u.dpy ?? (u.ry ?? u.y) * 2;
    wc.save();
    wc.translate(px, py + 3);
    wc.scale(0.72, 0.72);
    wc.translate(-px, -(py + 3));
    drawUnitBody(engine, u, def, wc);
    wc.restore();
    return;
  }
  // —— 原子级：受击挤压动画（squash & stretch）——刚受击的一瞬间被压扁再回弹
  const hu = u.hurt;
  if (hu > 14 && !def.aquatic) {
    const k = (hu - 14) / 10; // 0..1 衰减曲线
    const px = u.dpx ?? (u.rx ?? u.x) * 2;
    const py = u.dpy ?? (u.ry ?? u.y) * 2;
    wc.save();
    wc.translate(px, py + 3); // 锚定脚底
    wc.scale(1 + 0.22 * k, 1 - 0.26 * k);
    wc.translate(-px, -(py + 3));
    drawUnitBody(engine, u, def, wc);
    wc.restore();
    return;
  }
  drawUnitBody(engine, u, def, wc);
}

/** 质感工程 v3（Task 49）：动物远距 LOD 色表 —— zoom < 5.6 时简绘
 *  （全图视图 600+ 单位的完整精灵 ~30 rect/只 → 简绘 ~1/10 成本；远距肉眼等价）
 *  [body, dark, w, h]：主体系列色取自各族精灵本体，尺寸近似真实占地（512 空间） */
const ANIMAL_LOD: Record<string, [string, string, number, number]> = {
  sheep: ['#d4dde4', '#575757', 3, 2],
  wolf: ['#7a746b', '#3a342c', 3, 2],
  snowwolf: ['#d4dde4', '#9aa8b4', 3, 2],
  bear: ['#5e452c', '#3a342c', 4, 3],
  deer: ['#b08054', '#6e4a2b', 3, 3],
  penguin: ['#e8eef2', '#2a3440', 2, 3],
  camel: ['#d8b878', '#b09050', 4, 3],
  scorpion: ['#8a4a22', '#5a2f14', 3, 2],
  snake: ['#5f7a3e', '#3f5528', 3, 1],
  dragon: ['#9c2f26', '#5f1b15', 5, 4],
  skeleton: ['#e2ded2', '#a8a294', 2, 3],
  demon: ['#8a2f28', '#4a1815', 3, 3],
  mage: ['#e8d5c0', '#9b59d0', 2, 3],
  troll: ['#7a8a5a', '#55613c', 4, 4],
  ogre: ['#a08552', '#6e5a36', 4, 4],
  whitewalker: ['#bcd4de', '#7d97a4', 2, 3],
  vampire: ['#4a3a50', '#2c2230', 2, 3],
  kraken: ['#6a4a8a', '#46305e', 4, 3],
  sandworm: ['#c8ad6e', '#a08a52', 4, 2],
  basilisk: ['#6a8848', '#46602e', 4, 3],
  // —— P2：八新动物（中档 LOD 同样吃这套表：头/身/四肢步态）——
  chicken: ['#f6f1e4', '#b07a3a', 2, 2],
  pig: ['#e8a8a0', '#a86058', 3, 2],
  rabbit: ['#b8b0a4', '#6e685e', 2, 2],
  fox: ['#d97b3c', '#8a4a1c', 3, 2],
  fish: ['#9fd4d8', '#5a9aa8', 2, 1],
  crab: ['#d94a3a', '#8a2418', 3, 2],
  turtle: ['#4a7a3a', '#2e5424', 3, 2],
  shark: ['#5a6a78', '#2e3a46', 4, 2],
};

/** P0-A：精绘四足档位表（zoom≥8 走 ×4 精细像素精灵 drawQuadFine） */
const QUAD_FINE: Record<string, 'wolf' | 'snowwolf' | 'sheep' | 'bear' | 'deer'> = {
  wolf: 'wolf', snowwolf: 'snowwolf', sheep: 'sheep', bear: 'bear', deer: 'deer',
};

/** P2：水生精灵水面门控（离水不画；crab 凭 beach 特质可上滩） */
function onWaterTile(engine: GameEngine, u: Unit, beachOk: boolean): boolean {
  const t = engine.terrain[(u.y | 0) * 256 + (u.x | 0)];
  if (t === T.WATER || t === T.DEEP) return true;
  return beachOk && t === T.SAND;
}

/** P0-A：精绘档分发（zoom≥8）：人形 → drawPersonFine / 四足 → drawQuadFine。
 *  ×4 精细像素 = 0.25 tile = 1 用户像素：层 B(2px/tile) 内 scale(0.5) 回到 4px/tile
 *  精细网格，脚底 (fx,fy) 锚定到插值位置（吸附 1 用户像素 → 设备像素恒整，零 AA 糊边） */
function tryDrawFine(engine: GameEngine, u: Unit, def: (typeof RACES)[number], wc: CanvasRenderingContext2D, px: number, py: number, king: boolean): boolean {
  const fx = Math.round(u.rx ?? u.x);
  const fy = Math.round(u.ry ?? u.y) + 1;
  const tx = Math.round(px * 2) - fx;
  const ty = Math.round(py * 2) - fy;
  if (def.sprite === 'person') {
    if (u.trait === 'giant') return false; // 巨人走 ×2 专属巨躯
    const civ = u.civ >= 0 ? engine.civs[u.civ] : null;
    wc.save();
    wc.scale(0.5, 0.5);
    wc.translate(tx, ty);
    drawPersonFine(wc, u, civ && civ.alive ? civ.color : null, engine.frameCount, king);
    wc.restore();
    return true;
  }
  const quad = QUAD_FINE[def.sprite];
  if (quad && !def.vis) {
    wc.save();
    wc.scale(0.5, 0.5);
    wc.translate(tx, ty);
    drawQuadFine(wc, u, quad, engine.frameCount, king);
    wc.restore();
    return true;
  }
  return false;
}

/** 单位本体分发（LOD 四档：zoom<2.5 色点 / 2.5–5.6 中档迷你形态 / 5.6–8 全精灵 / ≥8 ×4 精绘） */
function drawUnitBody(engine: GameEngine, u: Unit, def: (typeof RACES)[number], wc: CanvasRenderingContext2D) {
  const zoom = engine.cam.zoom;
  const fc = engine.frameCount;
  const px = u.dpx ?? (u.rx ?? u.x) * 2;
  const py = u.dpy ?? (u.ry ?? u.y) * 2;
  const king = !!u.king;

  // —— P2：水生精灵水面门控（离水不画 —— 防御性：正常情况下引擎保证栖息地） ——
  if (def.sprite === 'fish' || def.sprite === 'turtle' || def.sprite === 'shark') {
    if (!onWaterTile(engine, u, false)) return;
  } else if (def.sprite === 'crab' && !onWaterTile(engine, u, true)) {
    return;
  }

  // —— P0-A 精绘档（zoom≥8）：×4 精细像素精灵 ——
  if (zoom >= 8 && tryDrawFine(engine, u, def, wc, px, py, king)) return;

  // —— P0-A 色点档（zoom<2.5）：单 rect 国色/族色（超大视野性能保底） ——
  if (zoom < 2.5) {
    if (def.sprite === 'person') {
      const civ = u.civ >= 0 ? engine.civs[u.civ] : null;
      wc.fillStyle = civ && civ.alive ? civ.colorHex : u.hurt > 0 ? '#ff6b5e' : '#9a8460';
      wc.fillRect(px - 1, py - 2, 2, 2);
      if (king) { wc.fillStyle = '#e6ba6c'; wc.fillRect(px - 1, py - 3, 2, 1); }
      return;
    }
    if (!def.vis) {
      const lod = ANIMAL_LOD[def.sprite];
      if (lod) {
        wc.fillStyle = u.hurt > 0 ? '#ff6b5e' : lod[0];
        wc.fillRect(px - (lod[2] >> 1), py - lod[3], lod[2], lod[3]);
        return;
      }
    }
    // 无表条目（涌现物种等）→ 落入下方全绘（数量稀少，成本可接受）
  } else if (zoom < 5.6) {
    // —— P0-A 中档 LOD（2.5–5.6）：可读迷你形态 ——
    if (def.sprite === 'person') {
      const f = u.flip ? -1 : 1;
      const hurt = u.hurt > 0;
      const civ = u.civ >= 0 ? engine.civs[u.civ] : null;
      const bx0 = f > 0 ? px : px - 1; // 身体左缘（朝向对齐）
      const moving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
      const g = moving ? (fc >> 3) & 1 : -1;
      // 双腿（两相步态；暗色裤装 —— 免国色系暗化字符串拼接）
      wc.fillStyle = '#3a342c';
      if (g === 0) {
        wc.fillRect(bx0, py, 1, 2);
        wc.fillRect(bx0 + 1, py + 1, 1, 1);
      } else if (g === 1) {
        wc.fillRect(bx0, py + 1, 1, 1);
        wc.fillRect(bx0 + 1, py, 1, 2);
      } else {
        wc.fillRect(bx0, py, 1, 2);
        wc.fillRect(bx0 + 1, py, 1, 2);
      }
      // 躯干（国色 2 宽）
      wc.fillStyle = hurt ? '#ff6b5e' : civ && civ.alive ? civ.colorHex : '#9a8460';
      wc.fillRect(bx0, py - 2, 2, 2);
      // 头（肤色 1×1，朝向前缘）
      wc.fillStyle = hurt ? '#ff6b5e' : '#d9a066';
      wc.fillRect(bx0 + (f > 0 ? 1 : 0), py - 3, 1, 1);
      // 武器像素（攻击时高举；火器深色近战钢色）
      if (u.wep) {
        wc.fillStyle = u.wep === 'musket' || u.wep === 'rifle' || u.wep === 'laser_rifle' ? '#4a4038' : '#d9d9d9';
        wc.fillRect(bx0 + (f > 0 ? 2 : -1), (u.atk ?? 0) > 0 ? py - 4 : py - 2, 1, 1);
      }
      // P4 脚底暗描边（森林/湿地背景可读性）
      wc.fillStyle = 'rgba(20,16,12,0.4)';
      wc.fillRect(bx0, py + 2, 2, 1);
      // 国王金冠（头顶 3px）
      if (king) drawCrown(wc, bx0 + (f > 0 ? 1 : 0), py - 4);
      return;
    }
    if (!def.vis) {
      const lod = ANIMAL_LOD[def.sprite];
      if (lod) {
        const hurt = u.hurt > 0;
        const w = lod[2], h = lod[3];
        const hw = w >> 1;
        const bx = px - hw;
        const by = py - h;
        const f = u.flip ? -1 : 1;
        const moving = u.lx !== undefined && (u.lx !== u.x || u.ly !== u.y);
        const g = moving ? (fc >> 3) & 1 : -1;
        // 四肢步态：前后腿常驻；中腿按对角相位起落（提起的腿藏进躯干不画）
        wc.fillStyle = hurt ? '#cf3f2e' : lod[1];
        wc.fillRect(bx, py, 1, 1);
        wc.fillRect(bx + w - 1, py, 1, 1);
        if (g !== 1) wc.fillRect(bx + 1, py, 1, 1);
        if (w >= 4 && g !== 0) wc.fillRect(bx + w - 2, py, 1, 1);
        // 躯干
        wc.fillStyle = hurt ? '#ff6b5e' : lod[0];
        wc.fillRect(bx, by, w, h);
        // P4 背部 1px 受光高光
        if (w >= 3) {
          wc.fillStyle = 'rgba(255,255,240,0.3)';
          wc.fillRect(bx + 1, by, 1, 1);
        }
        // 头部暗点（朝向感知：跟随 flip）
        const headX = px + (u.flip ? -hw - 1 : hw);
        wc.fillStyle = hurt ? '#cf3f2e' : lod[1];
        wc.fillRect(headX, by + (h > 2 ? 1 : 0), 1, 1);
        // P4 脚底暗描边
        wc.fillStyle = 'rgba(20,16,12,0.35)';
        wc.fillRect(bx, py + 1, w, 1);
        // 国王金冠（头顶）
        if (king) drawCrown(wc, headX, by - 1);
        return;
      }
    }
  }

  // v3 涌现物种（视觉基因组）：动态种化的非人形物种走程序化生物绘制 —— 外观随进化真实变化
  // Task 33：水生/沙泳/蛇形族系走专属巨怪形态（不再退化为四足兽形）
  if (def.vis && def.sprite !== 'person') {
    const mShape = def.aquatic ? 'aquatic' : def.sandswim ? 'worm' : def.sprite === 'basilisk' || def.sprite === 'snake' || def.sprite === 'dragon' ? 'serpent' : null;
    const vc = visCacheFor(u.race, def.vis, def.sprite);
    if (mShape && vc) {
      drawEmergentMonster(wc, u, vc, mShape, fc);
      return;
    }
    if (vc) {
      drawEmergentCreature(wc, u, vc, fc);
      return;
    }
  }
  switch (def.sprite) {
    case 'person': {
      const civ = u.civ >= 0 ? engine.civs[u.civ] : null;
      drawPerson(wc, u, civ && civ.alive ? civ.color : null, fc);
      break;
    }
    case 'sheep': drawSheep(wc, u); break;
    case 'wolf': drawWolf(wc, u); break;
    case 'snowwolf': drawSnowWolf(wc, u); break;
    case 'bear': drawBear(wc, u); break;
    case 'deer': drawDeer(wc, u); break;
    case 'penguin': drawPenguin(wc, u, fc); break;
    case 'camel': drawCamel(wc, u, fc); break;
    case 'scorpion': drawScorpion(wc, u, fc); break;
    case 'snake': drawSnake(wc, u, fc); break;
    case 'dragon': drawDragon(wc, u, fc); break;
    case 'skeleton': drawSkeleton(wc, u, fc); break;
    case 'demon': drawDemon(wc, u, fc); break;
    // —— 神话种族（仓库线：光明/浴火/守护/死灵/九头）——
    case 'angel': drawAngel(wc, u, fc); break;
    case 'phoenix': drawPhoenix(wc, u, fc); break;
    case 'ent': drawEnt(wc, u, fc); break;
    case 'lich': drawLich(wc, u, fc); break;
    case 'hydra': drawHydra(wc, u, fc); break;
    case 'mage': drawMage(wc, u, fc); break;
    case 'troll': drawTroll(wc, u, fc); break;
    case 'ogre': drawOgre(wc, u, fc); break;
    case 'whitewalker': drawWhiteWalker(wc, u, fc); break;
    case 'vampire': drawVampire(wc, u, fc); break;
    case 'kraken': drawKraken(wc, u, fc); break;
    case 'sandworm': drawSandworm(wc, u, fc); break;
    case 'basilisk': drawBasilisk(wc, u, fc); break;
    // —— P2：八新动物（完整档；水生已在函数头顶门控） ——
    case 'chicken': drawChicken(wc, u, fc); break;
    case 'pig': drawPig(wc, u, fc); break;
    case 'rabbit': drawRabbit(wc, u, fc); break;
    case 'fox': drawFox(wc, u, fc); break;
    case 'fish': drawFish(wc, u, fc); break;
    case 'crab': drawCrab(wc, u, fc); break;
    case 'turtle': drawTurtle(wc, u, fc); break;
    case 'shark': drawShark(wc, u, fc); break;
    // —— P2：未知精灵安全回退 —— 走 ANIMAL_LOD 色块（新种族接线遗漏时单位不消失、不崩溃） ——
    default: {
      const lod = ANIMAL_LOD[def.sprite];
      const lw = lod ? lod[2] : 2;
      const lh = lod ? lod[3] : 2;
      wc.fillStyle = u.hurt > 0 ? '#ff6b5e' : lod ? lod[0] : '#9a8460';
      wc.fillRect(px - (lw >> 1), py - lh, lw, lh);
      break;
    }
  }
  // P0-A：全绘档国王金冠（人形头顶；×2 精灵头顶 = 发际线上一行）
  if (king && def.sprite === 'person') drawCrown(wc, px, py - 4);
  // 涌现物种标记：动态种化诞生的新物种头顶 1px 突变色点（一眼辨识演化后裔）
  if (def.dynTint) {
    wc.fillStyle = u.hurt > 0 ? '#ff6b5e' : def.dynTint;
    wc.fillRect(px, py - 4, 1, 1);
  }
}

/** P0-B：特效粒子「首帧一次性」发射标记（fx() 每次 new 对象 → WeakSet 随特效 GC，零泄漏） */
const fxSparked = new WeakSet<Effect>();

function drawWorldEffect(engine: GameEngine, e: Effect, wc: CanvasRenderingContext2D) {
  // 质感工程 v3：吸附到 1/4 精灵格 —— hit/心/髅/出生等 1px 级图元保持锐利
  // （爆炸/烟雾等柔性图元本身就是软的，弧线 AA 无损其观感）
  const px = Math.round(e.x * 8) / 4;
  const py = Math.round(e.y * 8) / 4;
  const t = e.age / e.ttl;
  switch (e.kind) {
    case 'explosion': {
      // —— P0-B 像素爆炸：扫描线块状圆（白心→橙→红→灰四段，半径扩张）+ 火花粒子 + 块状冲击波环 ——
      const ex = Math.round(px);
      const ey = Math.round(py);
      const r = e.r * 2 * (0.3 + t * 1.1);
      const R = Math.max(1, Math.round(r));
      const hw2 = R * R;
      // 外圈（橙→红→灰冷却）
      wc.fillStyle = t < 0.25 ? '#ff9b2d' : t < 0.55 ? '#cf3f2e' : '#575757';
      for (let dy = -R; dy <= R; dy += 2) {
        const hw = Math.floor(Math.sqrt(hw2 - dy * dy));
        if (hw <= 0) continue;
        wc.fillRect(ex - hw, ey + dy, hw * 2, 2);
      }
      // 内芯（白心→橙黄余温）
      const R2 = Math.max(1, (R * 0.52) | 0);
      wc.fillStyle = t < 0.3 ? '#fff3c4' : t < 0.6 ? '#ffd93d' : '#8d8d8d';
      const hw3 = R2 * R2;
      for (let dy = -R2; dy <= R2; dy += 2) {
        const hw = Math.floor(Math.sqrt(hw3 - dy * dy));
        if (hw <= 0) continue;
        wc.fillRect(ex - hw, ey + dy, hw * 2, 2);
      }
      // 首帧：12-24 颗火花粒子（橙红灰三系，重力下坠）——WeakSet 防重复发射
      if (!fxSparked.has(e)) {
        fxSparked.add(e);
        const n = Math.ceil((12 + (e.seed % 13)) * FX_MUL[engineFxTier]);
        fxSparks(ex, ey, n, e.seed);
      }
      // 块状冲击波环：1px 快速扩张淡出（t<0.45；4 段矩形拼环 —— 比逐扫描线便宜一个量级）
      if (t < 0.45) {
        const rr = Math.round(r * 0.9 + t * 30);
        const wq = Math.max(1, Math.round(rr * 0.62));
        wc.globalAlpha = Math.max(0, 1 - t / 0.45) * 0.7;
        wc.fillStyle = '#fff3c4';
        wc.fillRect(ex - wq, ey - rr, wq * 2, 1);
        wc.fillRect(ex - wq, ey + rr, wq * 2, 1);
        wc.fillRect(ex - rr, ey - wq + 1, 1, wq * 2 - 1);
        wc.fillRect(ex + rr, ey - wq + 1, 1, wq * 2 - 1);
        wc.globalAlpha = 1;
      }
      break;
    }
    case 'smoke': {
      const rise = e.age / 4;
      wc.fillStyle = `rgba(90,88,84,${Math.max(0, 1 - t)})`;
      wc.fillRect(px - 1, py - rise - 2, 3, 3);
      wc.fillStyle = `rgba(60,58,54,${Math.max(0, 0.8 - t)})`;
      wc.fillRect(px, py - rise, 2, 2);
      break;
    }
    case 'skull': {
      const a = 1 - t;
      wc.fillStyle = `rgba(242,234,216,${a})`;
      wc.fillRect(px - 1, py - t * 4 - 1, 3, 3);
      wc.fillStyle = `rgba(20,16,12,${a})`;
      wc.fillRect(px - 1, py - t * 4, 1, 1);
      wc.fillRect(px + 1, py - t * 4, 1, 1);
      break;
    }
    case 'heart': {
      const a = 1 - t;
      const yy = py - t * 5;
      wc.fillStyle = `rgba(207,63,46,${a})`;
      wc.fillRect(px - 1, yy - 1, 2, 1);
      wc.fillRect(px - 1, yy, 3, 1);
      wc.fillRect(px, yy + 1, 1, 1);
      break;
    }
    case 'hit': {
      // P0-B：命中白闪接入粒子（量少 —— 2-3 颗溅射 + 原十字闪光）
      if (!fxSparked.has(e)) {
        fxSparked.add(e);
        const n = Math.ceil(3 * FX_MUL[engineFxTier]);
        for (let k = 0; k < n; k++) {
          const h = ((e.seed * 2654435761 + k * 97) >>> 0);
          fxSpawn(px, py, ((h % 9) - 4) * 0.05, -0.06 - (h % 5) * 0.02, 10 + (h % 8), 1, 0.012, FX_HIT_COLS[h & 1]);
        }
      }
      wc.fillStyle = t < 0.5 ? '#ffffff' : '#ffd93d';
      wc.fillRect(px - 1, py, 3, 1);
      wc.fillRect(px, py - 1, 1, 3);
      break;
    }
    case 'blood': {
      // P0-B：血雾接入粒子池（首帧 5 颗，红系，重力坠落；保留原 7 点放射爆裂）
      if (!fxSparked.has(e)) {
        fxSparked.add(e);
        const n = Math.ceil(5 * FX_MUL[engineFxTier]);
        for (let k = 0; k < n; k++) {
          const h = ((e.seed * 2654435761 + k * 2246822519) >>> 0);
          const ang = ((h % 628) / 100);
          fxSpawn(px, py, Math.cos(ang) * 0.14, Math.sin(ang) * 0.1 - 0.1, 14 + (h % 10), 1, 0.02, FX_BLOOD_COLS[h % 3]);
        }
      }
      // 血雾飞溅（吞噬/重击瞬间的红色粒子爆裂）
      const s = e.seed;
      for (let k = 0; k < 7; k++) {
        const ang = ((s >> (k * 2)) & 7) * (Math.PI / 4);
        const dist = t * (2 + ((s >> k) & 3));
        const bx = px + Math.cos(ang) * dist;
        const by = py + Math.sin(ang) * dist - t * 2;
        wc.fillStyle = t < 0.4 ? 'rgba(200,30,22,0.9)' : `rgba(140,20,15,${Math.max(0, 0.8 - t)})`;
        wc.fillRect(Math.round(bx), Math.round(by), 1, 1);
      }
      break;
    }
    case 'dust': {
      // P0-B：沙尘接入粒子池（首帧 4 颗，沙色，弱重力；保留原 4 点扬尘）
      if (!fxSparked.has(e)) {
        fxSparked.add(e);
        const n = Math.ceil(4 * FX_MUL[engineFxTier]);
        for (let k = 0; k < n; k++) {
          const h = ((e.seed * 2654435761 + k * 131) >>> 0);
          fxSpawn(px, py, ((h % 7) - 3) * 0.045, -0.05 - (h % 4) * 0.015, 12 + (h % 9), 1, 0.008, FX_DUST_COLS[h % 3]);
        }
      }
      // 沙尘扬起（沙虫潜行/重物落地的粒子）
      const s = e.seed;
      for (let k = 0; k < 4; k++) {
        const dx = (((s >> (k * 3)) & 7) - 3) * 0.5;
        const dy = -t * (1.5 + ((s >> k) & 1));
        wc.fillStyle = `rgba(222,203,141,${Math.max(0, 0.7 - t * 0.7)})`;
        wc.fillRect(Math.round(px + dx * t * 3), Math.round(py + dy), 1, 1);
      }
      break;
    }
    case 'spawn': {
      wc.fillStyle = `rgba(100,201,93,${1 - t})`;
      wc.fillRect(px, py - t * 6, 2, 2);
      break;
    }
    case 'bolt': {
      const a = 1 - t;
      // jagged bolt from the sky
      let bx = px + (e.seed % 7) - 3;
      const top = py - 56;
      wc.strokeStyle = `rgba(255,243,196,${a})`;
      wc.lineWidth = 2;
      wc.beginPath();
      wc.moveTo(bx, top);
      let cy = top;
      while (cy < py - 4) {
        cy += 7;
        bx += ((e.seed + cy) % 9) - 4;
        wc.lineTo(bx, cy);
      }
      wc.lineTo(px, py);
      wc.stroke();
      wc.fillStyle = `rgba(255,217,61,${a})`;
      wc.fillRect(px - 2, py - 2, 5, 5);
      break;
    }
    case 'tornado':
      drawTornado(wc, e, engine.frameCount);
      break;
    case 'acid': {
      // 酸雨云：半透明暗绿云盖 + 持续下落的绿色雨丝（哈希门控稀疏采样）
      const R = e.r * 2;
      const t = e.age / e.ttl;
      const fade = t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1; // 尾段渐散
      const fc = engine.frameCount;
      wc.globalAlpha = 0.22 * fade;
      wc.fillStyle = '#3f6b2f';
      wc.beginPath();
      wc.arc(px, py, R, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 0.14 * fade;
      wc.fillStyle = '#64c95d';
      wc.beginPath();
      wc.arc(px, py - R * 0.25, R * 0.75, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      // 雨丝：24 条按 seed 错相下落的 1x2 竖线（6px 下落带回绕）
      const n = 24;
      for (let k = 0; k < n; k++) {
        const h = ((e.seed * 2654435761 + k * 97) >>> 0) % 997;
        const ang = (h / 997) * Math.PI * 2;
        const rr = Math.sqrt(h % 100) / 10 * R * 0.92;
        const dx = px + Math.cos(ang) * rr;
        const dy = py + Math.sin(ang) * rr;
        const speed = 0.6 + ((h >> 4) % 5) * 0.15;
        const fall = Math.floor(((h >> 7) + fc * speed) % 6);
        wc.fillStyle = (h & 1) ? `rgba(140,220,90,${0.85 * fade})` : `rgba(100,201,93,${0.7 * fade})`;
        wc.fillRect(Math.round(dx), Math.round(dy - 3 + fall), 1, 2);
      }
      break;
    }
    case 'fireball': {
      // 法师火球：从施法者飞向目标（沿直线插值），尾迹渐隐
      const t = Math.min(1, e.age / e.ttl);
      const fx = (e.x0 ?? e.x) + (e.x - (e.x0 ?? e.x)) * t;
      const fy = (e.y0 ?? e.y) + (e.y - (e.y0 ?? e.y)) * t;
      const px = fx * 2;
      const py = fy * 2;
      // 尾迹（最近 4 个相位点的暗橙渐隐）
      for (let k = 1; k <= 4; k++) {
        const tt = Math.max(0, t - k * 0.06);
        const txp = ((e.x0 ?? e.x) + (e.x - (e.x0 ?? e.x)) * tt) * 2;
        const typ = ((e.y0 ?? e.y) + (e.y - (e.y0 ?? e.y)) * tt) * 2;
        wc.fillStyle = k % 2 ? `rgba(255,155,45,${0.55 - k * 0.12})` : `rgba(255,217,61,${0.5 - k * 0.1})`;
        wc.fillRect(Math.round(txp), Math.round(typ), 2, 2);
      }
      // 球体：外橙内黄 + 白心（2x2 像素火球）
      wc.fillStyle = '#ff9b2d';
      wc.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
      wc.fillStyle = '#ffd93d';
      wc.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
      wc.fillStyle = '#fff3c4';
      wc.fillRect(Math.round(px), Math.round(py), 1, 1);
      break;
    }
    case 'bullet': {
      // 步枪曳光弹：高速直线弹道（暖黄曳光尾 + 白亮弹头）
      const bt = Math.min(1, e.age / e.ttl);
      const bsx = e.x0 ?? e.x;
      const bsy = e.y0 ?? e.y;
      const bfx = bsx + (e.x - bsx) * bt;
      const bfy = bsy + (e.y - bsy) * bt;
      const bdx = e.x - bsx;
      const bdy = e.y - bsy;
      const blen = Math.hypot(bdx, bdy) || 1;
      const bux = bdx / blen;
      const buy = bdy / blen;
      const bpx = Math.round(bfx * 2);
      const bpy = Math.round(bfy * 2);
      // 曳光尾（两段渐隐）
      wc.fillStyle = 'rgba(255,205,80,0.75)';
      wc.fillRect(bpx - Math.round(bux * 2), bpy - Math.round(buy * 2), 2, 1);
      wc.fillStyle = 'rgba(255,160,50,0.45)';
      wc.fillRect(bpx - Math.round(bux * 4), bpy - Math.round(buy * 4), 2, 1);
      // 弹头（白亮）
      wc.fillStyle = '#fff3c4';
      wc.fillRect(bpx, bpy, 1, 1);
      break;
    }
    case 'shell': {
      // 炮弹：抛物线弹道（升弧-降弧），深灰弹体 + 尾烟
      const st = Math.min(1, e.age / e.ttl);
      const ssx = e.x0 ?? e.x;
      const ssy = e.y0 ?? e.y;
      const sfx = ssx + (e.x - ssx) * st;
      const sfy = ssy + (e.y - ssy) * st;
      const sdist = Math.hypot(e.x - ssx, e.y - ssy);
      const sarc = Math.sin(st * Math.PI) * Math.min(14, sdist * 0.35 + 3);
      const spx = Math.round(sfx * 2);
      const spy = Math.round((sfy - sarc) * 2);
      // 尾烟（弹道后方灰烟）
      const st2 = Math.max(0, st - 0.08);
      const sfx2 = ssx + (e.x - ssx) * st2;
      const sfy2 = ssy + (e.y - ssy) * st2;
      const sarc2 = Math.sin(st2 * Math.PI) * Math.min(14, sdist * 0.35 + 3);
      wc.fillStyle = 'rgba(120,116,110,0.5)';
      wc.fillRect(Math.round(sfx2 * 2), Math.round((sfy2 - sarc2) * 2), 2, 2);
      // 弹体（深灰 2x2 + 装药色弹头 —— v3 每种弹头有专属视觉签名）
      wc.fillStyle = '#575757';
      wc.fillRect(spx - 1, spy - 1, 2, 2);
      wc.fillStyle = e.col ?? '#14100c';
      wc.fillRect(spx, spy, 1, 1);
      break;
    }
    case 'missile': {
      // 导弹：弧线巡航（先爬升后俯冲），白弹体 + 尾焰 + 烟迹（核弹头带红点）
      const mt = Math.min(1, e.age / e.ttl);
      const msx = e.x0 ?? e.x;
      const msy = e.y0 ?? e.y;
      const mfx = msx + (e.x - msx) * mt;
      const mfy = msy + (e.y - msy) * mt;
      const mdist = Math.hypot(e.x - msx, e.y - msy);
      const marc = Math.sin(mt * Math.PI) * Math.min(20, mdist * 0.45 + 4) * (e.nuke ? 1.3 : 1);
      const mpx = Math.round(mfx * 2);
      const mpy = Math.round((mfy - marc) * 2);
      // 烟迹（尾向后 3 粒渐隐）
      for (let k = 1; k <= 3; k++) {
        const tk = Math.max(0, mt - k * 0.05);
        const cx = msx + (e.x - msx) * tk;
        const cy = msy + (e.y - msy) * tk;
        const ca = Math.sin(tk * Math.PI) * Math.min(20, mdist * 0.45 + 4) * (e.nuke ? 1.3 : 1);
        wc.fillStyle = `rgba(150,146,140,${0.6 - k * 0.16})`;
        wc.fillRect(Math.round(cx * 2), Math.round((cy - ca) * 2), 2, 2);
      }
      // 尾焰（橙黄闪动）
      const mfc = engine.frameCount;
      wc.fillStyle = (mfc >> 2) & 1 ? '#ff9b2d' : '#ffd93d';
      wc.fillRect(mpx - 2, mpy, 2, 2);
      // 弹体（白）+ 核弹头红点
      wc.fillStyle = '#f2ead8';
      wc.fillRect(mpx, mpy, 2, 1);
      if (e.nuke) {
        wc.fillStyle = '#cf3f2e';
        wc.fillRect(mpx, mpy, 1, 1);
      }
      break;
    }
    case 'airstrike': {
      // 轰炸机：沿航线平飞（机身 + 双翼 + 螺旋桨闪烁 + 地面投影 + 尾迹）
      const at = Math.min(1, e.age / e.ttl);
      const asx = e.x0 ?? e.x;
      const asy = e.y0 ?? e.y;
      const afx = asx + (e.x - asx) * at;
      const afy = asy + (e.y - asy) * at + Math.sin(at * Math.PI * 2) * 1.2; // 轻微颠簸
      const apx = Math.round(afx * 2);
      const apy = Math.round(afy * 2);
      const adx = e.x - asx;
      const ady = e.y - asy;
      const aux = adx / (Math.hypot(adx, ady) || 1);
      const afc = engine.frameCount;
      // 地面投影（高空机影）
      wc.fillStyle = 'rgba(0,0,0,0.22)';
      wc.fillRect(apx - 3, Math.round(afy * 2) + 6, 7, 1);
      // 机身（暗绿灰 7x2）
      wc.fillStyle = '#5a6b4a';
      wc.fillRect(apx - 3, apy - 1, 7, 2);
      // 双翼（上下浅色条）
      wc.fillStyle = '#d9d4c5';
      wc.fillRect(apx - 2, apy - 2, 5, 1);
      wc.fillRect(apx - 2, apy + 1, 5, 1);
      // 机头方向标 + 螺旋桨闪烁
      wc.fillStyle = (afc >> 2) & 1 ? '#f2ead8' : '#9a9483';
      wc.fillRect(apx + Math.round(aux * 4), apy, 1, 1);
      // 尾迹
      wc.fillStyle = 'rgba(200,196,186,0.35)';
      wc.fillRect(apx - Math.round(aux * 8) - 2, apy, 3, 1);
      break;
    }
    case 'laser': {
      // 激光炮台：瞬时相干光束（青白主线 + 外晕 + 命中点爆闪）
      const lt2 = e.age / e.ttl;
      const lsx = (e.x0 ?? e.x) * 2;
      const lsy = (e.y0 ?? e.y) * 2;
      const flick = ((engine.frameCount >> 1) & 1) ? 1 : 0.7; // 高频闪烁
      // 外晕（青色宽线）
      wc.strokeStyle = `rgba(90,220,255,${0.35 * flick * (1 - lt2 * 0.4)})`;
      wc.lineWidth = 4;
      wc.beginPath();
      wc.moveTo(lsx, lsy);
      wc.lineTo(px, py);
      wc.stroke();
      // 主线（白亮 2px）
      wc.strokeStyle = `rgba(240,252,255,${0.95 * flick})`;
      wc.lineWidth = 2;
      wc.beginPath();
      wc.moveTo(lsx, lsy);
      wc.lineTo(px, py);
      wc.stroke();
      // 命中点爆闪（白核 + 青晕）
      wc.fillStyle = `rgba(240,252,255,${flick})`;
      wc.fillRect(px - 2, py - 2, 4, 4);
      wc.fillStyle = `rgba(90,220,255,${0.5 * flick})`;
      wc.fillRect(px - 3, py - 3, 6, 6);
      break;
    }
    case 'drone': {
      // 无人机蜂群：5 架小型攻击无人机沿航线散布飞行（机身 + 红色传感器 + 旋翼闪烁 + 投影）
      const dt = Math.min(1, e.age / e.ttl);
      const dsx = (e.x0 ?? e.x) * 2;
      const dsy = (e.y0 ?? e.y) * 2;
      const dfc = engine.frameCount;
      for (let k = 0; k < 5; k++) {
        // 每架错相推进（seed 派生相位 + 前后错开）
        const phase = ((e.seed + k * 37) % 100) / 100;
        const kt = Math.max(0, Math.min(1, dt - k * 0.045 - phase * 0.05));
        const kx = dsx + (px - dsx) * kt;
        const ky = dsy + (py - dsy) * kt;
        // 蜂群横向散布（正弦游走）
        const wob = Math.sin((e.age + k * 11) * 0.35) * 4;
        const fxp = Math.round(kx + wob);
        const fyp = Math.round(ky - 8 + Math.sin((e.age + k * 7) * 0.28) * 2); // 低空悬停高度
        // 地面投影（游荡黑影）
        wc.fillStyle = 'rgba(0,0,0,0.2)';
        wc.fillRect(fxp - 1, Math.round(ky) + 2, 3, 1);
        // 机身（深灰 3x1）
        wc.fillStyle = '#3a3f42';
        wc.fillRect(fxp - 1, fyp, 3, 1);
        // 装药色传感器眼（v3）
        wc.fillStyle = e.col ?? '#ff4d4d';
        wc.fillRect(fxp + 1, fyp, 1, 1);
        // 双旋翼闪烁（上下白色交替）
        wc.fillStyle = (dfc + k * 3) % 6 < 3 ? 'rgba(220,235,245,0.8)' : 'rgba(160,175,185,0.5)';
        wc.fillRect(fxp - 2, fyp - 1, 1, 1);
        wc.fillRect(fxp + 2, fyp - 1, 1, 1);
      }
      break;
    }
    case 'orbital': {
      // 轨道天罚：落点预警红圈 + 天顶坠落的钨棒（白色长光柱 + 摩擦红光 + 加速坠落）
      const ot = e.age / e.ttl;
      const ofc = engine.frameCount;
      // —— 落点预警圈（前 60% 时间：脉动红环 + 十字准星）——
      if (ot < 0.6) {
        const pulse = 0.5 + Math.sin(ofc * 0.4) * 0.5;
        wc.strokeStyle = `rgba(255,60,40,${0.3 + pulse * 0.5})`;
        wc.lineWidth = 1;
        wc.beginPath();
        wc.arc(px, py, 8 + pulse * 3, 0, Math.PI * 2);
        wc.stroke();
        wc.fillStyle = `rgba(255,60,40,${0.5 + pulse * 0.3})`;
        wc.fillRect(px - 4, py, 2, 1);
        wc.fillRect(px + 3, py, 2, 1);
        wc.fillRect(px, py - 4, 1, 2);
        wc.fillRect(px, py + 3, 1, 2);
      }
      // —— 钨棒：t² 加速坠落（从天顶 88px 高度砸向落点）——
      const dropT = Math.min(1, Math.pow(ot, 1.8)); // 加速插值
      const rodTop = py - 88 * (1 - dropT) - 14;
      const rodBot = py - 88 * (1 - dropT);
      if (rodBot > py - 90 && rodBot <= py) {
        // 尾迹光柱（白青渐隐）
        const grad = wc.createLinearGradient(px, rodTop - 10, px, rodBot);
        grad.addColorStop(0, 'rgba(120,230,255,0)');
        grad.addColorStop(1, 'rgba(220,250,255,0.9)');
        wc.fillStyle = grad;
        wc.fillRect(px - 1, rodTop - 10, 2, rodBot - rodTop + 10);
        // 棒体（白亮 2x6）
        wc.fillStyle = '#f0fcff';
        wc.fillRect(px - 1, rodBot - 6, 2, 6);
        // 摩擦红光（棒头）
        wc.fillStyle = 'rgba(255,120,60,0.7)';
        wc.fillRect(px - 1, rodBot - 2, 2, 2);
      }
      break;
    }
    case 'mech': {
      // 机甲突击：大型双足机甲地面推进（机身 + 金色驾驶舱 + 交替双腿 + 机炮闪光 + 阴影）
      const mt2 = Math.min(1, e.age / e.ttl);
      const msx = (e.x0 ?? e.x) * 2;
      const msy = (e.y0 ?? e.y) * 2;
      const mxp = Math.round(msx + (px - msx) * mt2);
      const myp = Math.round(msy + (py - msy) * mt2);
      const mfc = engine.frameCount;
      const mdir = Math.atan2(py - msy, px - msx);
      const mdx = Math.cos(mdir);
      // 地面阴影
      wc.fillStyle = 'rgba(0,0,0,0.25)';
      wc.fillRect(mxp - 5, myp + 3, 11, 2);
      // 双腿交替步态（两帧交换前后）
      const stride = (mfc >> 3) & 1;
      wc.fillStyle = '#2e3236';
      wc.fillRect(mxp - 3 + (stride ? 1 : -1), myp, 2, 4); // 左腿
      wc.fillRect(mxp + 1 - (stride ? 1 : -1), myp, 2, 4); // 右腿
      // 机身（深灰装甲块 9x5 + 肩部斜面）
      wc.fillStyle = '#3a3f42';
      wc.fillRect(mxp - 4, myp - 7, 9, 5);
      wc.fillStyle = '#4a5054';
      wc.fillRect(mxp - 3, myp - 8, 7, 1);
      // 金色驾驶舱（传感器）
      wc.fillStyle = '#e8c14a';
      wc.fillRect(mxp + Math.round(mdx * 3), myp - 6, 2, 2);
      // 机炮（前向炮管 + 周期枪口闪光）
      wc.fillStyle = '#24282b';
      wc.fillRect(mxp + Math.round(mdx * 5), myp - 4, Math.round(mdx * 4) || 2, 1);
      if (mfc % 12 < 3) {
        wc.fillStyle = '#ffd93d';
        wc.fillRect(mxp + Math.round(mdx * 8), myp - 5, 2, 2);
      }
      // 排热口（背部橙色微光）
      wc.fillStyle = mfc % 10 < 5 ? 'rgba(255,120,50,0.6)' : 'rgba(200,90,40,0.35)';
      wc.fillRect(mxp - 4, myp - 5, 1, 2);
      break;
    }
    case 'plasma': {
      // 等离子炮：慢速电浆光球（白心青绿晕 + 电弧尾迹 + 电离闪烁）
      const pt2 = e.age / e.ttl;
      const psx = (e.x0 ?? e.x) * 2;
      const psy = (e.y0 ?? e.y) * 2;
      const pfx = psx + (px - psx) * pt2;
      const pfy = psy + (py - psy) * pt2;
      const pfc = engine.frameCount;
      // 电离光晕（径向脉动）
      const glow = 5 + Math.sin(pfc * 0.5) * 1.5;
      const pgrad = wc.createRadialGradient(pfx, pfy, 1, pfx, pfy, glow);
      pgrad.addColorStop(0, 'rgba(120,255,210,0.85)');
      pgrad.addColorStop(0.6, 'rgba(60,220,180,0.35)');
      pgrad.addColorStop(1, 'rgba(40,180,150,0)');
      wc.fillStyle = pgrad;
      wc.beginPath();
      wc.arc(pfx, pfy, glow, 0, Math.PI * 2);
      wc.fill();
      // 球体（白心 + 青绿核）
      wc.fillStyle = '#eafff7';
      wc.fillRect(pfx - 1, pfy - 1, 3, 3);
      wc.fillStyle = '#6ff5cf';
      wc.fillRect(pfx, pfy, 1, 1);
      // 电弧尾迹（3 段随机锯齿）
      for (let k = 1; k <= 3; k++) {
        const tk = Math.max(0, pt2 - k * 0.06);
        const txp = psx + (px - psx) * tk;
        const typ = psy + (py - psy) * tk;
        const jitter = ((e.seed * 2654435761 + k * 997 + pfc * 31) >>> 0) % 5 - 2;
        wc.strokeStyle = `rgba(140,255,220,${0.55 - k * 0.13})`;
        wc.lineWidth = 1;
        wc.beginPath();
        wc.moveTo(txp, typ);
        wc.lineTo(txp + jitter, typ + jitter - 1);
        wc.lineTo(txp + jitter * 2 - 2, typ - 2);
        wc.stroke();
      }
      break;
    }
    case 'antimatter': {
      // 反物质弹：白青弹体 + 前端紫色湮灭辉光 + 螺旋粒子尾
      const at2 = Math.min(1, e.age / e.ttl);
      const asx = (e.x0 ?? e.x) * 2;
      const asy = (e.y0 ?? e.y) * 2;
      const afx = asx + (px - asx) * at2;
      const afy = asy + (py - asy) * at2;
      const afc = engine.frameCount;
      // 螺旋粒子尾（4 粒绕弹道旋转）
      for (let k = 0; k < 4; k++) {
        const tk = Math.max(0, at2 - 0.05 - k * 0.04);
        const txp = asx + (px - asx) * tk;
        const typ = asy + (py - asy) * tk;
        const ang = (e.age + k * 9) * 0.5;
        const rr = 2.5;
        wc.fillStyle = k % 2 ? 'rgba(216,160,255,0.8)' : 'rgba(240,250,255,0.7)';
        wc.fillRect(Math.round(txp + Math.cos(ang) * rr), Math.round(typ + Math.sin(ang) * rr), 1, 1);
      }
      // 前端湮灭辉光（紫色脉动）
      const aglow = 3 + Math.sin(afc * 0.7) * 1.2;
      wc.fillStyle = 'rgba(190,120,255,0.45)';
      wc.beginPath();
      wc.arc(afx, afy, aglow + 2, 0, Math.PI * 2);
      wc.fill();
      // 弹体（白青 2x3）
      wc.fillStyle = '#eafcff';
      wc.fillRect(afx - 1, afy - 1, 2, 3);
      wc.fillStyle = '#9feaff';
      wc.fillRect(afx, afy, 1, 1);
      break;
    }
    case 'volcano': {
      // 火山喷发柱：山体上方周期性涌出的岩浆喷泉 + 火山灰烟柱 + 火星四溅
      const fc = engine.frameCount;
      const active = e.age < e.ttl - 10;
      // 喷发柱（黄心橙柱，随帧脉动高度）
      if (active) {
        const pulse = 6 + ((fc >> 2) % 4) * 3;
        wc.fillStyle = '#cf3f2e';
        wc.fillRect(px - 2, py - pulse - 6, 4, pulse);
        wc.fillStyle = '#ff9b2d';
        wc.fillRect(px - 1, py - pulse - 4, 2, pulse - 1);
        wc.fillStyle = '#ffd93d';
        wc.fillRect(px - 1, py - pulse - 7 + ((fc >> 3) % 2), 2, 4);
        // 火星四溅（哈希门控 6 点放射）
        for (let k = 0; k < 6; k++) {
          const h = ((e.seed * 2654435761 + k * 997 + fc * 13) >>> 0) % 360;
          const ang = (h / 360) * Math.PI * 2;
          const rr = 3 + ((h >> 5) % 9);
          wc.fillStyle = (h & 1) ? '#ffd93d' : '#ff9b2d';
          wc.fillRect(Math.round(px + Math.cos(ang) * rr), Math.round(py - 6 + Math.sin(ang) * rr * 0.7 - (fc % 7) * 0.5), 1, 1);
        }
      }
      // 火山灰烟柱（暗灰渐大渐隐，持续到效果末期）
      const smokeT = e.age / e.ttl;
      const rise = smokeT * 26;
      wc.fillStyle = `rgba(60,58,54,${Math.max(0.15, 0.55 - smokeT * 0.4)})`;
      wc.beginPath();
      wc.arc(px, py - 10 - rise, 4 + smokeT * 12, 0, Math.PI * 2);
      wc.fill();
      wc.fillStyle = `rgba(90,88,84,${Math.max(0.1, 0.4 - smokeT * 0.3)})`;
      wc.beginPath();
      wc.arc(px - 2, py - 6 - rise * 0.7, 3 + smokeT * 9, 0, Math.PI * 2);
      wc.fill();
      // 底部岩浆辉光
      wc.fillStyle = `rgba(255,155,45,${active ? 0.4 : 0.15})`;
      wc.beginPath();
      wc.arc(px, py, 6, 0, Math.PI * 2);
      wc.fill();
      break;
    }
    case 'tsunami': {
      // 海啸：从震中向外扩张的巨浪环（白沫前沿 + 深水色浪体 + 飞沫点）
      const t = e.age / e.ttl;
      // 波前半径随时间扩张（e.r = 最大浪级）
      const waveR = 2 + t * e.r * 2;
      const thickness = 3 + (1 - t) * 4;
      wc.strokeStyle = `rgba(247,249,251,${Math.max(0.2, 0.95 - t * 0.75)})`;
      wc.lineWidth = thickness;
      wc.beginPath();
      wc.arc(px, py, waveR, 0, Math.PI * 2);
      wc.stroke();
      // 深水浪体（第二道环）
      wc.strokeStyle = `rgba(43,111,174,${Math.max(0.15, 0.7 - t * 0.6)})`;
      wc.lineWidth = thickness + 2;
      wc.beginPath();
      wc.arc(px, py, Math.max(1, waveR - thickness), 0, Math.PI * 2);
      wc.stroke();
      // 白色飞沫（哈希门控 10 点沿波前散布）
      const fc = engine.frameCount;
      for (let k = 0; k < 10; k++) {
        const h = ((e.seed * 2654435761 + k * 769 + fc * 17) >>> 0) % 997;
        const ang = (h / 997) * Math.PI * 2;
        const rr = waveR + ((h % 5) - 2);
        wc.fillStyle = `rgba(247,249,251,${0.9 - t * 0.6})`;
        wc.fillRect(Math.round(px + Math.cos(ang) * rr), Math.round(py + Math.sin(ang) * rr - ((h >> 4) % 3)), 1, 1);
      }
      break;
    }
    case 'blizzard': {
      // 暴风雪云：翻滚的灰白云团 + 密集飘雪
      const BR = e.r * 2;
      const t = e.age / e.ttl;
      const fade = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : 1;
      const fc = engine.frameCount;
      wc.globalAlpha = 0.3 * fade;
      wc.fillStyle = '#c9d6e2';
      wc.beginPath();
      wc.arc(px, py, BR, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 0.22 * fade;
      wc.fillStyle = '#f7f9fb';
      wc.beginPath();
      wc.arc(px + ((fc >> 4) % 2 ? 2 : -2), py - BR * 0.2, BR * 0.7, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      // 密集飘雪（28 条哈希门控下落雪点，带横向风偏）
      for (let k = 0; k < 28; k++) {
        const h = ((e.seed * 2654435761 + k * 97) >>> 0) % 997;
        const ang = (h / 997) * Math.PI * 2;
        const rr = Math.sqrt(h % 100) / 10 * BR * 0.92;
        const dx = px + Math.cos(ang) * rr + ((fc >> 3) % 2 ? 1 : 0);
        const dy = py + Math.sin(ang) * rr;
        const fall = Math.floor(((h >> 7) + fc * 0.7) % 8);
        wc.fillStyle = (h & 1) ? `rgba(247,249,251,${0.95 * fade})` : `rgba(201,214,226,${0.8 * fade})`;
        wc.fillRect(Math.round(dx), Math.round(dy - 4 + fall), 1, 1);
      }
      break;
    }
    case 'locust': {
      // 蝗群：密集的黄褐色虫群（双层虫云 + 虫点乱舞）
      const LR = e.r * 2 * 0.8;
      const t = e.age / e.ttl;
      const fade = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : 1;
      const fc = engine.frameCount;
      wc.globalAlpha = 0.28 * fade;
      wc.fillStyle = '#a8862a';
      wc.beginPath();
      wc.arc(px, py, LR, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      // 虫点乱舞（32 只：黄褐双色，高频抖动）
      for (let k = 0; k < 32; k++) {
        const h = ((e.seed * 2654435761 + k * 131) >>> 0) % 997;
        const ang = (h / 997) * Math.PI * 2;
        const rr = Math.sqrt(h % 100) / 10 * LR * 0.9;
        const jitter = ((h + fc * (1 + (h % 3))) % 7) - 3;
        const dx = px + Math.cos(ang) * rr + (jitter % 3);
        const dy = py + Math.sin(ang) * rr + ((jitter >> 1) % 3);
        wc.fillStyle = (h & 1) ? `rgba(201,160,42,${0.9 * fade})` : `rgba(138,111,32,${0.85 * fade})`;
        wc.fillRect(Math.round(dx), Math.round(dy), 1, 1);
      }
      break;
    }
    case 'drought': {
      // 干旱：灼热旱魃穹顶（橙金热雾 + 热浪扭曲条纹上升）
      const DR = e.r * 2;
      const t = e.age / e.ttl;
      const fade = t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1;
      const fc = engine.frameCount;
      wc.globalAlpha = 0.16 * fade;
      wc.fillStyle = '#ff9b2d';
      wc.beginPath();
      wc.arc(px, py - DR * 0.15, DR, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 0.12 * fade;
      wc.fillStyle = '#ffd93d';
      wc.beginPath();
      wc.arc(px, py - DR * 0.25, DR * 0.6, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      // 热浪扭曲条纹（水平细线随帧错位上升）
      for (let k = 0; k < 5; k++) {
        const yy = py - DR + ((fc * 0.4 + k * (DR * 2 / 5)) % (DR * 2));
        const off = (((e.seed * 2654435761 + k * 997) >>> 0) % 5 + fc) % 5 - 2;
        wc.fillStyle = `rgba(255,217,61,${0.28 * fade})`;
        wc.fillRect(Math.round(px - DR * 0.8 + off), Math.round(yy), Math.round(DR * 1.6), 1);
      }
      break;
    }
    case 'mushroom': {
      const grow = Math.min(1, t * 2.2);
      const stemH = 10 + t * 8;
      wc.fillStyle = '#8a8073';
      wc.fillRect(px - 2, py - stemH, 4, stemH);
      wc.fillStyle = t < 0.4 ? '#ff9b2d' : '#b1a08c';
      wc.beginPath();
      wc.arc(px, py - stemH, 5 + grow * 9, 0, Math.PI * 2);
      wc.fill();
      wc.fillStyle = t < 0.4 ? '#ffd93d' : '#cbb99f';
      wc.beginPath();
      wc.arc(px, py - stemH + 2, 3 + grow * 6, 0, Math.PI * 2);
      wc.fill();
      break;
    }
    case 'arrow': {
      // 弓手箭矢：从施放者飞向目标（细长深色箭体 + 白羽尾）
      const t = Math.min(1, e.age / e.ttl);
      const fx = (e.x0 ?? e.x) + (e.x - (e.x0 ?? e.x)) * t;
      const fy = (e.y0 ?? e.y) + (e.y - (e.y0 ?? e.y)) * t;
      const px2 = Math.round(fx * 2);
      const py2 = Math.round(fy * 2);
      const dx = e.x - (e.x0 ?? e.x);
      const dy = e.y - (e.y0 ?? e.y);
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // 箭体（2px 深木色）沿飞行方向
      wc.fillStyle = '#8a5a2c';
      wc.fillRect(px2 - Math.round(ux), py2 - Math.round(uy), 2, 1);
      wc.fillRect(px2, py2, 2, 1);
      // 箭头（钢白）
      wc.fillStyle = '#e8e8e8';
      wc.fillRect(px2 + Math.round(ux), py2 + Math.round(uy), 1, 1);
      // 尾羽（白）
      wc.fillStyle = 'rgba(240,240,240,0.9)';
      wc.fillRect(px2 - Math.round(ux * 2) - 1, py2 - Math.round(uy * 2), 1, 1);
      break;
    }
    case 'coin': {
      // 金币（商人贸易入账）：上浮渐隐的金色小圆
      const a = 1 - t;
      wc.fillStyle = `rgba(255,217,61,${a})`;
      wc.fillRect(px - 1, py - Math.round(t * 5), 2, 2);
      wc.fillStyle = `rgba(201,160,42,${a})`;
      wc.fillRect(px, py - Math.round(t * 5), 1, 1);
      break;
    }
    case 'water': {
      // 灭火水花（国民消防）：蓝色水滴四溅 + 上升水雾
      const a = 1 - t;
      const seed = e.seed || 0;
      for (let k = 0; k < 5; k++) {
        const ang = (seed * 0.7 + k * 1.256) % 6.283;
        const dist = t * 4 + 0.5;
        const dx = Math.round(Math.cos(ang) * dist);
        const dy = Math.round(Math.sin(ang) * dist * 0.6 - t * 2);
        wc.fillStyle = k % 2 ? `rgba(96,190,255,${a})` : `rgba(56,140,235,${a})`;
        wc.fillRect(px + dx, py + dy, 1, 2 - Math.round(t));
      }
      // 中心水柱闪光
      if (t < 0.5) {
        wc.fillStyle = `rgba(180,225,255,${1 - t * 2})`;
        wc.fillRect(px - 1, py - 2 - Math.round(t * 3), 2, 3);
      }
      break;
    }
    case 'hammer': {
      // 维修火花（建筑师修复）：金橙十字敲击星
      const a = 1 - t;
      const flick = (engine.frameCount >> 2) & 1;
      wc.fillStyle = `rgba(255,187,61,${a})`;
      const cx = px + (flick ? 1 : -1);
      const cy = py - 2 + (flick ? 0 : 1);
      wc.fillRect(cx - 2, cy, 5, 1);
      wc.fillRect(cx, cy - 2, 1, 5);
      wc.fillStyle = `rgba(255,238,170,${a})`;
      wc.fillRect(cx, cy, 1, 1);
      break;
    }
    case 'rainstorm': {
      // 唤雨云：蓝灰云盖 + 落雨丝（与酸雨对称的治愈蓝）
      const R = e.r * 2;
      const fade = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : 1;
      const fc = engine.frameCount;
      wc.globalAlpha = 0.24 * fade;
      wc.fillStyle = '#4a6a8a';
      wc.beginPath();
      wc.arc(px, py, R, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 0.16 * fade;
      wc.fillStyle = '#9cc4e8';
      wc.beginPath();
      wc.arc(px, py - R * 0.22, R * 0.72, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      const n = 26;
      for (let k = 0; k < n; k++) {
        const h = ((e.seed * 2654435761 + k * 89) >>> 0) % 991;
        const ang = (h / 991) * Math.PI * 2;
        const rr = Math.sqrt(h % 100) / 10 * R * 0.9;
        const dx = px + Math.cos(ang) * rr;
        const dy = py + Math.sin(ang) * rr;
        const speed = 0.7 + ((h >> 4) % 4) * 0.2;
        const fall = Math.floor(((h >> 7) + fc * speed) % 7);
        wc.fillStyle = (h & 1) ? `rgba(130,180,235,${0.8 * fade})` : `rgba(96,150,220,${0.65 * fade})`;
        wc.fillRect(Math.round(dx), Math.round(dy - 4 + fall), 1, 2);
      }
      break;
    }
    case 'bless': {
      // 神恩祝福：金色升腾光点 + 十字辉光
      const a = 1 - t;
      const fc = engine.frameCount;
      for (let k = 0; k < 4; k++) {
        const h = ((e.seed + k * 131) >>> 0) % 97;
        const rise = t * 5 + ((h % 3));
        wc.fillStyle = k % 2 ? `rgba(255,217,61,${a})` : `rgba(255,240,170,${a})`;
        wc.fillRect(px + (k % 2 ? 1 : -1), py - rise, 1, 1);
      }
      if ((fc >> 3) & 1) {
        wc.fillStyle = `rgba(255,230,120,${a * 0.9})`;
        wc.fillRect(px - 2, py - 3, 5, 1);
        wc.fillRect(px, py - 5, 1, 5);
      }
      break;
    }
    case 'curse': {
      // 神罚诅咒：紫霾沉降滴 + 阴影圈
      const a = 1 - t;
      const fc = engine.frameCount;
      wc.fillStyle = `rgba(120,60,160,${a * 0.25})`;
      wc.beginPath();
      wc.arc(px, py, 3.2, 0, Math.PI * 2);
      wc.fill();
      for (let k = 0; k < 4; k++) {
        const h = ((e.seed + k * 97) >>> 0) % 83;
        const fall = t * 4 + (h % 3);
        wc.fillStyle = (h & 1) ? `rgba(160,90,210,${a})` : `rgba(110,50,170,${a})`;
        wc.fillRect(px + ((k % 3) - 1), py - 3 + fall, 1, 2);
      }
      if ((fc >> 3) & 1) {
        wc.fillStyle = `rgba(190,120,240,${a})`;
        wc.fillRect(px - 1, py - 4, 1, 1);
      }
      break;
    }
    case 'mutate': {
      // 基因突变：绿色双螺旋粒子环绕
      const a = 1 - t;
      const fc = engine.frameCount;
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2 + t * 4;
        const rr = 2.4 * (1 - t * 0.4);
        const dx = Math.round(px + Math.cos(ang) * rr);
        const dy = Math.round(py + Math.sin(ang) * rr * 0.7 - t * 3);
        wc.fillStyle = k % 2 ? `rgba(111,214,111,${a})` : `rgba(52,150,60,${a})`;
        wc.fillRect(dx, dy, 1, 1);
      }
      wc.fillStyle = `rgba(220,255,200,${a})`;
      wc.fillRect(px, py - Math.round(t * 4), 1, 1);
      break;
    }
    case 'spark': {
      // 空间传送：青白四芒星闪
      const a = 1 - t;
      const s = Math.round(2 + (1 - t) * 2);
      wc.fillStyle = `rgba(120,230,230,${a})`;
      wc.fillRect(px - s, py, s * 2 + 1, 1);
      wc.fillRect(px, py - s, 1, s * 2 + 1);
      wc.fillStyle = `rgba(255,255,255,${a})`;
      wc.fillRect(px, py, 1, 1);
      break;
    }
    case 'wrath': {
      // 天罚风暴：压城怒云（暗紫黑 + 内部电光闪烁）
      const R = e.r * 2;
      const fc = engine.frameCount;
      wc.globalAlpha = 0.32;
      wc.fillStyle = '#241a2e';
      wc.beginPath();
      wc.arc(px, py, R, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 0.22;
      wc.fillStyle = '#3a2a4e';
      wc.beginPath();
      wc.arc(px, py - R * 0.2, R * 0.7, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      // 云内电光（帧级闪烁）
      if ((fc >> 2) % 3 === 0) {
        const h = ((e.seed + fc * 31) >>> 0) % 360;
        const ang = (h / 360) * Math.PI * 2;
        wc.strokeStyle = 'rgba(255,240,160,0.85)';
        wc.lineWidth = 1;
        wc.beginPath();
        wc.moveTo(px + Math.cos(ang) * R * 0.5, py - R * 0.3);
        wc.lineTo(px + Math.cos(ang) * R * 0.2, py);
        wc.lineTo(px + Math.cos(ang + 1) * R * 0.4, py + R * 0.2);
        wc.stroke();
      }
      break;
    }
    case 'holystorm': {
      // 圣光风暴：金色圣云（暖金双层云体 + 旋转光羽 + 落金辉 + 地面光柱光斑）
      const R = e.r * 2;
      const fade = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : 1;
      const fc = engine.frameCount;
      // 双层云体（外层暖金 + 内层亮白金，呼吸明灭）
      const breathe = 0.24 + 0.06 * Math.sin(fc * 0.06);
      wc.globalAlpha = breathe * fade;
      wc.fillStyle = '#c9a02a';
      wc.beginPath();
      wc.arc(px, py, R, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = (breathe + 0.1) * fade;
      wc.fillStyle = '#f7e9b8';
      wc.beginPath();
      wc.arc(px, py - R * 0.18, R * 0.72, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      // 旋转光羽（四道弧形光带，慢速公转 —— 圣云的庄严旋转感）
      for (let arm = 0; arm < 4; arm++) {
        const a0 = fc * 0.008 + (arm / 4) * Math.PI * 2;
        wc.strokeStyle = `rgba(255,233,138,${0.4 * fade})`;
        wc.lineWidth = 1.5;
        wc.beginPath();
        wc.arc(px, py, R * (0.55 + 0.08 * (arm & 1)), a0, a0 + 1.1);
        wc.stroke();
      }
      // 落金辉（确定性散布的金色光点，缓缓下坠 —— 圣光洒落）
      for (let k = 0; k < 14; k++) {
        const h = ((e.seed * 2654435761 + k * 197) >>> 0) % 991;
        const ang = (h / 991) * Math.PI * 2;
        const rr = Math.sqrt(h % 97) / 9.85 * R * 0.9;
        const fall = (fc * 0.4 + (h & 7)) % 12;
        wc.fillStyle = (h & 1) ? `rgba(255,217,61,${0.75 * fade})` : `rgba(255,243,196,${0.55 * fade})`;
        wc.fillRect(Math.round(px + Math.cos(ang) * rr), Math.round(py + Math.sin(ang) * rr * 0.7 + fall), 1, 1);
      }
      // 中心圣光柱（后程临近消散时收束为一线 —— 圣云归天的告别）
      if (t > 0.7) {
        wc.fillStyle = `rgba(255,247,194,${0.3 * fade})`;
        wc.fillRect(Math.round(px) - 1, Math.round(py - R), 2, Math.round(R * 1.2));
      }
      break;
    }
    case 'sandstorm': {
      // 沙尘暴：土黄云体 + 旋转沙粒
      const R = e.r * 2;
      const fade = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : 1;
      const fc = engine.frameCount;
      wc.globalAlpha = 0.26 * fade;
      wc.fillStyle = '#b08d55';
      wc.beginPath();
      wc.arc(px, py, R, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 0.18 * fade;
      wc.fillStyle = '#d4b077';
      wc.beginPath();
      wc.arc(px, py - R * 0.2, R * 0.7, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      const n = 22;
      for (let k = 0; k < n; k++) {
        const h = ((e.seed * 2654435761 + k * 113) >>> 0) % 983;
        const ang = (h / 983) * Math.PI * 2 + (fc * 0.05);
        const rr = Math.sqrt(h % 100) / 10 * R * 0.9;
        wc.fillStyle = (h & 1) ? `rgba(196,173,116,${0.8 * fade})` : `rgba(227,207,150,${0.6 * fade})`;
        wc.fillRect(Math.round(px + Math.cos(ang) * rr), Math.round(py + Math.sin(ang) * rr * 0.75 - ((fc + k) % 4)), 1, 1);
      }
      break;
    }
    case 'typhoon': {
      // 台风：蓝白气旋螺旋 + 环雨丝
      const R = e.r * 2;
      const fade = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : 1;
      const fc = engine.frameCount;
      wc.globalAlpha = 0.2 * fade;
      wc.fillStyle = '#3a6a9a';
      wc.beginPath();
      wc.arc(px, py, R, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      // 旋转雨带（三条弧线，帧驱动旋转）
      for (let arm = 0; arm < 3; arm++) {
        wc.strokeStyle = `rgba(150,200,240,${0.5 * fade})`;
        wc.lineWidth = 2;
        wc.beginPath();
        const base = arm * 2.094 + (fc * 0.02);
        wc.arc(px, py, R * 0.75, base, base + 1.4);
        wc.stroke();
      }
      // 风眼
      wc.fillStyle = `rgba(255,255,255,${0.5 * fade})`;
      wc.fillRect(px - 1, py - 1, 2, 2);
      break;
    }
    case 'sinkhole': {
      // 深渊天坑：塌陷环 + 坠落碎石 + 中心黑洞加深
      const R = e.r * 2 * t;
      const a = 1 - t * 0.3;
      wc.strokeStyle = `rgba(70,60,50,${a})`;
      wc.lineWidth = 2;
      wc.beginPath();
      wc.arc(px, py, Math.max(1, R), 0, Math.PI * 2);
      wc.stroke();
      // 内部深渊（越晚越黑越大）
      wc.fillStyle = `rgba(10,8,6,${Math.min(0.9, t * 1.1)})`;
      wc.beginPath();
      wc.arc(px, py, Math.max(1, R * 0.8), 0, Math.PI * 2);
      wc.fill();
      // 环上坠落碎屑
      const fc = engine.frameCount;
      for (let k = 0; k < 8; k++) {
        const h = ((e.seed + k * 71) >>> 0) % 89;
        const ang = (h / 89) * Math.PI * 2;
        const rr = R * (0.9 + (h % 5) * 0.06);
        wc.fillStyle = `rgba(90,80,70,${a})`;
        wc.fillRect(Math.round(px + Math.cos(ang) * rr), Math.round(py + Math.sin(ang) * rr - ((fc + k * 3) % 6) * 0.4), 1, 1);
      }
      break;
    }
    case 'iceage': {
      // 冰河寒潮：青白穹顶 + 飘雪
      const R = e.r * 2;
      const fade = t > 0.9 ? Math.max(0, 1 - (t - 0.9) / 0.1) : 1;
      const fc = engine.frameCount;
      wc.globalAlpha = 0.16 * fade;
      wc.fillStyle = '#a8d8f0';
      wc.beginPath();
      wc.arc(px, py, R, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 0.1 * fade;
      wc.fillStyle = '#d8f0ff';
      wc.beginPath();
      wc.arc(px, py - R * 0.15, R * 0.7, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      // 穹顶边缘冰晶闪
      for (let k = 0; k < 14; k++) {
        const h = ((e.seed * 2654435761 + k * 173) >>> 0) % 977;
        const ang = (h / 977) * Math.PI * 2;
        const rr = R * 0.96;
        const tw = ((h >> 5) + (fc >> 3)) % 4;
        if (tw === 0) {
          wc.fillStyle = `rgba(255,255,255,${0.85 * fade})`;
          wc.fillRect(Math.round(px + Math.cos(ang) * rr), Math.round(py + Math.sin(ang) * rr), 1, 1);
        }
      }
      // 内部飘雪
      for (let k = 0; k < 12; k++) {
        const h = ((e.seed + k * 311) >>> 0) % 89;
        const ang = (h / 89) * Math.PI * 2;
        const rr = Math.sqrt(h % 100) / 10 * R * 0.85;
        const fall = ((h >> 3) + fc * 0.3) % 6;
        wc.fillStyle = `rgba(240,250,255,${0.7 * fade})`;
        wc.fillRect(Math.round(px + Math.cos(ang) * rr), Math.round(py + Math.sin(ang) * rr + fall), 1, 1);
      }
      break;
    }
    case 'famine': {
      // 饥荒：灰紫贫瘠之云 + 枯萎灰烬下落
      const R = e.r * 2;
      const fade = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : 1;
      const fc = engine.frameCount;
      wc.globalAlpha = 0.22 * fade;
      wc.fillStyle = '#565060';
      wc.beginPath();
      wc.arc(px, py, R, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 0.14 * fade;
      wc.fillStyle = '#7a7488';
      wc.beginPath();
      wc.arc(px, py - R * 0.2, R * 0.7, 0, Math.PI * 2);
      wc.fill();
      wc.globalAlpha = 1;
      for (let k = 0; k < 16; k++) {
        const h = ((e.seed * 2654435761 + k * 107) >>> 0) % 977;
        const ang = (h / 977) * Math.PI * 2;
        const rr = Math.sqrt(h % 100) / 10 * R * 0.9;
        const fall = ((h >> 6) + fc * 0.25) % 8;
        wc.fillStyle = (h & 1) ? `rgba(110,104,96,${0.6 * fade})` : `rgba(150,140,130,${0.45 * fade})`;
        wc.fillRect(Math.round(px + Math.cos(ang) * rr), Math.round(py + Math.sin(ang) * rr - 5 + fall * 0.7), 1, 1);
      }
      break;
    }
    case 'blackhole': {
      // 黑洞：纯黑奇点 + 紫色吸积环（吞噬中的时空陷阱）
      const grow = Math.min(1, e.age / 50 + 0.25);
      const core = Math.max(1, e.r * 0.5 * grow);
      const disc = Math.max(2, e.r * 1.1 * grow);
      const fc = engine.frameCount;
      // 吸积盘（旋转紫焰弧）
      for (let arm = 0; arm < 3; arm++) {
        wc.strokeStyle = `rgba(181,108,240,${0.55})`;
        wc.lineWidth = 2;
        wc.beginPath();
        const base = arm * 2.094 - (fc * 0.04);
        wc.arc(px, py, disc, base, base + 1.2);
        wc.stroke();
      }
      // 被吸入的粒子流
      for (let k = 0; k < 10; k++) {
        const h = ((e.seed + k * 97 + fc * 13) >>> 0) % 360;
        const ang = (h / 360) * Math.PI * 2;
        const rr = disc * (1.1 - ((fc + k * 7) % 10) * 0.05);
        wc.fillStyle = k % 2 ? 'rgba(181,108,240,0.8)' : 'rgba(230,200,255,0.6)';
        wc.fillRect(Math.round(px + Math.cos(ang) * rr), Math.round(py + Math.sin(ang) * rr * 0.85), 1, 1);
      }
      // 奇点（纯黑圆 + 细白描边）
      wc.fillStyle = '#050308';
      wc.beginPath();
      wc.arc(px, py, core, 0, Math.PI * 2);
      wc.fill();
      wc.strokeStyle = 'rgba(255,255,255,0.5)';
      wc.lineWidth = 1;
      wc.beginPath();
      wc.arc(px, py, core + 0.5, 0, Math.PI * 2);
      wc.stroke();
      break;
    }
    default:
      break;
  }
}

// minimap
export function renderMinimap(engine: GameEngine, ctx: CanvasRenderingContext2D, mw: number, mh: number, view: { w: number; h: number }) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = DEEP_BG;
  ctx.fillRect(0, 0, mw, mh);
  ctx.drawImage(engine.terrainCanvas, 0, 0, mw, mh);
  // 小地图同步显示覆盖层（政治/温度/湿度模式下的全局视角）
  if (engine.overlayMode !== 'none') {
    if (engine.overlayDirty) engine.redrawOverlay();
    ctx.globalAlpha = 0.62;
    ctx.drawImage(engine.overlayCanvas, 0, 0, mw, mh);
    ctx.globalAlpha = 1;
  }
  // units as dots
  for (const u of engine.units) {
    const c = RACES[u.race];
    let col: string;
    if (c.isCiv && u.civ >= 0 && engine.civs[u.civ]?.alive) col = engine.civs[u.civ].colorHex;
    else col = u.race === R.ZOMBIE ? '#64c95d' : u.race === R.DRAGON ? '#cf3f2e' : '#f2ead8';
    ctx.fillStyle = col;
    // 殖民船在小地图上画稍大的 2x2 点，更易追踪
    if (u.boat) ctx.fillRect((u.x / 256) * mw - 1, (u.y / 160) * mh - 1, 2, 2);
    else ctx.fillRect((u.x / 256) * mw, (u.y / 160) * mh, 1, 1);
  }
  // —— P1：小地图战略层 —— 建筑（金点）/ 燃烧格（橙点）/ 活跃战线（红点）
  ctx.fillStyle = '#ffd93d';
  for (const b of engine.buildings) {
    ctx.fillRect((b.x / 256) * mw, (b.y / 160) * mh, 1, 1);
  }
  ctx.fillStyle = '#ff9b2d';
  for (const fi of engine.fireSet) {
    ctx.fillRect(((fi % 256) / 256) * mw, (((fi / 256) | 0) / 160) * mh, 1, 1);
  }
  ctx.fillStyle = '#ff4030';
  for (const bi of engine.activeBattles.keys()) {
    ctx.fillRect(((bi % 256) / 256) * mw, (((bi / 256) | 0) / 160) * mh, 1, 1);
  }
  // viewport rect
  const zx = (engine.cam.x / 256) * mw;
  const zy = (engine.cam.y / 160) * mh;
  const zw = (view.w / engine.cam.zoom / 256) * mw;
  const zh = (view.h / engine.cam.zoom / 160) * mh;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(zx - zw / 2, zy - zh / 2, zw, zh);
}
