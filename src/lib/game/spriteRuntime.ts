// ============ 开源素材位图运行时 —— Dawnlike(CC-BY 4.0) + Kenney(CC0) atlas 管线 ============
// 设计要点：
// 1. 构建期（scripts/build-sprites.py）已把 16×16 精灵重组进 public/sprites/pwb_atlas.png，
//    坐标表在 spriteAtlas.ts（自动生成，勿手改）；
// 2. 唯一绘制入口 blitSprite()：失败返回 false，调用方回落程序化精绘（#98~#103 半单位重制
//    作为兜底与涌现物种通道保留——双路线并存，atlas 未就绪/缺素材/特殊姿态零回归）；
// 3. 王国色染色（tint）：像素级 HSL 判定衣物色（灰阶金属/暗描边/高光不染；
//    Dawnlike 皮肤簇 h∈[35°,70°]∧s≥0.55∧l≥0.55 排除——色簇实测三版迭代收敛）；
//    皮肤/金属/发色保留，衣装染成王国色并保持明暗阶梯。染色帧离屏 LRU（上限 600）；
// 4. LOD：atlas 内置 8×8 half 帧（面积平均降采样），远距档换帧像素风不糊；
// 5. atlasEpoch：onload 自增——精灵光栅缓存（render.ts spriteCache）据此整体失效，
//    防止「atlas 未就绪期光栅的程序化版本」被相位稳定的 key 永久锁定（#104 实锤 bug：
//    人形静止 2 相位在数十秒内全部光栅完成，此后永远命中旧版；动物因相位更多而自愈）。
import { ATLAS, type AtlasEntry } from './spriteAtlas';

let atlasImg: HTMLImageElement | null = null;
let atlasCanvas: HTMLCanvasElement | null = null;
let loadPromise: Promise<void> | null = null;

/** atlas 就绪纪元（onload 自增）：精灵光栅缓存据此整体失效 */
export const atlasEpoch = { n: 0 };

export function atlasReady(): boolean {
  return atlasImg !== null && atlasImg.complete && atlasImg.naturalWidth > 0;
}

/** 游戏启动时调用一次（render() 开头）；失败静默（渲染层自动走程序化兜底） */
export function ensureAtlas(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      atlasEpoch.n++;
      atlasImg = img;
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        atlasCanvas = c;
      } catch { /* tainted canvas 保护：染色不可用时贴图仍可用 */ }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = 'sprites/pwb_atlas.png'; // 相对路径：GitHub Pages 与 Worker 双入口同源部署均可达
  });
  return loadPromise;
}

// ---------------- HSL 小工具 ----------------
function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (mx === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return [h, s, l];
}
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/** 衣物色域判定：排除灰阶金属（s<0.18）/暗描边（l<0.22）/高光（l>0.68）/
 *  Dawnlike 皮肤簇（暖域高饱和亮色，实测 h58 s0.6 l0.6）；其余彩色一律视作衣物
 *  （绿衣/蓝袍/红帽全覆盖——WorldBox 制服感） */
function isClothPixel(h: number, s: number, l: number): boolean {
  if (s < 0.18 || l < 0.22 || l > 0.68) return false;
  if (h >= 35 / 360 && h <= 70 / 360 && s >= 0.5 && l >= 0.55) return false;
  return true;
}

// ---------------- 染色帧缓存（LRU） ----------------
const TINT_CAP = 600;
const tintCache = new Map<string, HTMLCanvasElement>();

function tintKey(c: [number, number, number]): string {
  return `${c[0] << 16 | c[1] << 8 | c[2]}`;
}

/** 生成染色帧：衣物色域像素 → 王国色（保持明度阶梯），其余原样 */
function makeTinted(entry: AtlasEntry, frame: number, color: [number, number, number]): HTMLCanvasElement | null {
  if (!atlasCanvas) return null;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const cx = c.getContext('2d')!;
  cx.drawImage(atlasCanvas, entry.x + frame * 16, entry.y, 16, 16, 0, 0, 16, 16);
  const img = cx.getImageData(0, 0, 16, 16);
  const d = img.data;
  const [th, ts, tl] = rgb2hsl(color[0], color[1], color[2]);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
    if (!isClothPixel(h, s, l)) continue;
    // 明度阶梯映射：原像素相对亮度 → 王国色明度带（亮部不趋白、暗部沉底）
    const rel = (l - 0.22) / 0.46; // 0..1
    const nl = Math.max(0.18, Math.min(0.66, 0.26 + rel * 0.4 * (tl / 0.5)));
    const ns = Math.max(0.25, Math.min(0.92, ts * 0.8 + s * 0.2));
    const [r, g, b] = hsl2rgb(th, ns, nl);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  cx.putImageData(img, 0, 0);
  return c;
}

function tintedFrame(name: string, entry: AtlasEntry, frame: number, color: [number, number, number]): HTMLCanvasElement | null {
  const key = `${name}|${tintKey(color)}|${frame}`;
  const hit = tintCache.get(key);
  if (hit) { // LRU touch
    tintCache.delete(key); tintCache.set(key, hit);
    return hit;
  }
  const made = makeTinted(entry, frame, color);
  if (!made) return null;
  if (tintCache.size >= TINT_CAP) {
    const oldest = tintCache.keys().next().value as string | undefined;
    if (oldest !== undefined) tintCache.delete(oldest);
  }
  tintCache.set(key, made);
  return made;
}

// ---------------- 绘制入口 ----------------
export interface BlitOpts {
  /** 动画帧（0/1）；缺省 0 */
  frame?: number;
  /** 左右镜像 */
  flip?: boolean;
  /** 王国色染色（仅 tintable 精灵生效；染色失败回落原帧） */
  tint?: [number, number, number] | null;
  /** 整数放大（大建筑 2 = 32×32，对冲 render 层 scale(0.5) 包裹） */
  scale?: number;
  /** LOD 档：true = 8×8 half 帧（远距档） */
  lod?: boolean;
  /** 整体透明度（幽灵 0.7 等） */
  alpha?: number;
  /** 受击闪白 */
  hurt?: boolean;
  /** 脚底椭圆阴影 */
  shadow?: boolean;
}

/**
 * 贴图：px/py = 脚底中心（与宿主 draw* 函数同坐标系）。
 * @returns false = atlas 未就绪或精灵不存在（调用方回落程序化精绘）
 */
export function blitSprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  px: number,
  py: number,
  opts: BlitOpts = {},
): boolean {
  const entry = ATLAS[name];
  if (!entry || !atlasImg) return false;
  const frames = Math.max(1, entry.frames);
  const frame = ((opts.frame ?? 0) | 0) % frames;
  const lod = opts.lod === true;
  const sx = lod ? entry.lodX : entry.x + frame * 16;
  const sy = lod ? entry.lodY : entry.y;
  const sw = lod ? 8 : 16;
  const sh = lod ? 8 : 16;
  const scale = opts.scale ?? 1;
  const w = sw * scale, h = sh * scale;

  // 源图：染色帧优先（tintable 且给了色；失败回落原帧——不因染色失败丢贴图）
  let src: CanvasImageSource = atlasImg;
  if (entry.tintable && opts.tint && atlasCanvas) {
    const t = tintedFrame(name, entry, frame, opts.tint);
    if (t) src = t;
  }

  const x = px - w / 2;
  const y = py - h + 1; // 脚底中心对齐：帧底 = py

  if (opts.shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px - (lod ? 2 : 4), py + 1, lod ? 4 : 8, 1);
  }
  // 状态切换最小化：filter/alpha 仅在需要时写入（上千单位满载时每帧状态机切换是热点）
  let filterUsed = false, alphaUsed = false;
  if (opts.alpha !== undefined && opts.alpha < 1) { ctx.globalAlpha = opts.alpha; alphaUsed = true; }
  if (opts.hurt) { ctx.filter = 'brightness(2.2) saturate(0.4)'; filterUsed = true; }
  if (opts.flip) {
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
  }
  if (filterUsed) ctx.filter = 'none';
  if (alphaUsed) ctx.globalAlpha = 1;
  return true;
}
