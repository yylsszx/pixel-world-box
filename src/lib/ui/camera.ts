// ============ 镜头增强（Task 45-b）：平滑飞行 + 镜头书签 ============
// 纯 TS 模块（引擎只读调用）：飞行状态机由 GameCanvas 的 rAF 主循环每帧驱动
// （tickFlight），与既有跟随（followId）/ 缩放滑行（zoomAnim）/ 小地图点击跳转兼容。
import { getEngine } from '@/store/gameStore';

export interface CamPose {
  x: number;
  y: number;
  zoom: number;
}

/** 镜头书签持久化键（wb_ 前缀铁律）：长度 9 的数组，空槽为 null */
const BOOKMARK_KEY = 'wb_cam_marks';

interface Flight {
  from: CamPose;
  to: CamPose;
  t0: number;
  dur: number;
}

let flight: Flight | null = null;

/** 读取当前镜头位姿（引擎只读） */
export function currentPose(): CamPose {
  const cam = getEngine().cam;
  return { x: cam.x, y: cam.y, zoom: cam.zoom };
}

/**
 * 请求一次平滑飞行（easeOutCubic ~400ms）。飞行期间：
 * - 清除引擎跟随（followId）与缩放滑行（zoomAnim），避免三方争抢 cam；
 * - 任何用户输入（指针拖动 / 滚轮 / 键盘平移）会调用 cancelFlight 打断。
 */
export function flyTo(to: { x: number; y: number; zoom?: number }, dur = 400): void {
  const eng = getEngine();
  eng.followId = null;
  eng.zoomAnim = null;
  const from = currentPose();
  flight = { from, to: { x: to.x, y: to.y, zoom: to.zoom ?? from.zoom }, t0: performance.now(), dur: Math.max(120, dur) };
}

/** 用户主动操作镜头时打断飞行（GameCanvas 输入路径调用） */
export function cancelFlight(): void {
  flight = null;
}

export function isFlying(): boolean {
  return flight !== null;
}

/**
 * 每帧推进飞行动画 —— 由 GameCanvas 主循环在 engine.frame 之前调用。
 * 返回 true 表示本帧仍在飞行（调用方可据此抑制惯性等其它镜头效果）。
 */
export function tickFlight(): boolean {
  const f = flight;
  if (!f) return false;
  const eng = getEngine();
  const p = Math.min(1, (performance.now() - f.t0) / f.dur);
  const e = 1 - Math.pow(1 - p, 3); // easeOutCubic：起步快、落点稳
  eng.zoomAnim = null; // 压制滚轮缩放滑行的回写（飞行期间缩放完全由飞行接管）
  eng.cam.x = f.from.x + (f.to.x - f.from.x) * e;
  eng.cam.y = f.from.y + (f.to.y - f.from.y) * e;
  eng.cam.zoom = f.from.zoom + (f.to.zoom - f.from.zoom) * e;
  eng.clampCam();
  if (p >= 1) flight = null;
  return true;
}

// ---------------- 镜头书签（Shift+数字存 / Alt+数字跳） ----------------

function loadMarks(): (CamPose | null)[] {
  const out: (CamPose | null)[] = new Array(9).fill(null);
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY);
    if (!raw) return out;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return out;
    for (let i = 0; i < 9 && i < arr.length; i++) {
      const m = arr[i] as CamPose | null;
      if (m && Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.zoom)) {
        out[i] = { x: m.x, y: m.y, zoom: m.zoom };
      }
    }
  } catch {
    /* 损坏则视为无书签 */
  }
  return out;
}

function saveMarks(marks: (CamPose | null)[]): void {
  try {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(marks));
  } catch {
    /* 隐私模式忽略 */
  }
}

/** 保存当前镜头到书签 n（1-9）；返回是否成功 */
export function saveBookmark(n: number): boolean {
  if (n < 1 || n > 9) return false;
  const marks = loadMarks();
  marks[n - 1] = currentPose();
  saveMarks(marks);
  return true;
}

/** 平滑飞回书签 n（1-9）；返回书签是否存在 */
export function jumpBookmark(n: number): boolean {
  if (n < 1 || n > 9) return false;
  const m = loadMarks()[n - 1];
  if (!m) return false;
  flyTo(m, 400);
  return true;
}
