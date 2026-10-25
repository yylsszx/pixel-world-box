'use client';
// ============ Main game canvas: render loop + full input system ============
// Task 45-b 交互体系 2.0（在本文件挂接，引擎零改动）：
//   · Shift+左键拖拽 = 框选单位（原 Shift 拖拽平移移除；右键/中键拖拽仍平移）
//   · 右键点击（非拖拽）= 上下文菜单；触屏长按 = 同菜单（≈右键）
//   · 拖拽释放惯性滑行 / 镜头书签飞行（lib/ui/camera.ts）
//   · 工具施放前后挂撤销快照（lib/ui/undo.ts）
//   · 悬停信息芯片数据（50ms 节流写入 store.hoverInfo）
//   · 新键位：Ctrl+K / ? / Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Shift+数字 / Alt+数字 / X
//     （键位审计与冲突处理见 lib/ui/keymap.ts 头注）
//
// 【Task 75 指挥模式门控 + 高频热路径性能重构】
//   · 指挥模式（默认关）总门控：框选 / 右键·长按菜单 / 长按凝视 / 悬停芯片 / 触屏气泡 /
//     命令面板 / 键位速查 / 镜头书签 全部需开启后才能用；简洁模式只保留
//     拖动平移 / 滚轮·双指缩放 / 双击放大 / 工具施放 / 点选检查器 / 撤销重做 等基础操作
//   · 性能：①画布 getBoundingClientRect 改缓存（手势起点/resize 失效，懒重建）——
//     pointermove 高频热路径零强制布局读取；②框选矩形改 DOM 直写，拖动全程零 React
//     重渲染；③双指手势 Map 迭代直取两点，免每次 move 的数组分配；④简洁模式下悬停
//     拾取整体停算（原本每 50ms 一次全单位最近邻扫描）
import { useEffect, useRef } from 'react';
import { render } from '@/lib/game/render';
import { TOOL_BY_ID } from '@/lib/game/constants';
import { RACES } from '@/lib/game/types';
import type { ToastMsg, WorldEvent } from '@/lib/game/types';
import { sfx } from '@/lib/game/sfx';
import { getEngine, useGameStore } from '@/store/gameStore';
import { beginStroke, endStroke, cancelStroke, strokeActive, undo, redo } from '@/lib/ui/undo';
import { cancelFlight, tickFlight, saveBookmark, jumpBookmark } from '@/lib/ui/camera';

const SPAWN_THROTTLE = 90;
const LIGHTNING_THROTTLE = 160;
const BOOM_THROTTLE = 200;
const PLAGUE_THROTTLE = 260;
const ACID_THROTTLE = 600; // 酸雨云持续 150 tick，拖动施放间隔拉长防堆叠
const CLOUD_THROTTLE = 700; // 暴风雪/干旱穹顶等持续型云系天灾同规格节流
const AUTOSAVE_MS = 60_000; // 世界自动存档间隔：60 秒

/** 地形名（悬停芯片/右键菜单「此处信息」用；与 T 枚举一一对应） */
const TERRAIN_NAMES: string[] = ['深海', '浅海', '沙滩', '草地', '森林', '丘陵', '山地', '雪原', '岩浆', '焦土', '冰面'];
/** 框选单位上限（超出取前 200 并提示） */
const BOX_SELECT_CAP = 200;
/** 悬停芯片节流（ms） */
const HOVER_THROTTLE = 50;

function throttleFor(tool: string): number {
  const t = TOOL_BY_ID[tool];
  if (!t) return 0;
  if (t.single) return -1; // never on drag
  if (t.brush) return 0; // continuous
  // —— P3：新工具显式节流（swamp 笔刷连刷 / flood·finger 单发；与 def.brush/single 双保险） ——
  if (tool === 'swamp') return 0;
  if (tool === 'flood' || tool === 'finger') return -1;
  if (tool === 'lightning') return LIGHTNING_THROTTLE;
  if (tool === 'boom') return BOOM_THROTTLE;
  if (tool === 'plague') return PLAGUE_THROTTLE;
  if (tool === 'acidrain') return ACID_THROTTLE;
  if (tool === 'blizzard' || tool === 'drought') return CLOUD_THROTTLE;
  if (t.tab === 'creatures' || t.tab === 'animals') return SPAWN_THROTTLE;
  return 0;
}

/** 屏幕坐标（相对画布左上）→ 世界坐标 */
function toWorld(px: number, py: number, cw: number, ch: number) {
  return getEngine().screenToWorld(px, py, cw, ch);
}

/** 神之视界文本（Task 70 造物主凝视）：长按空地一瞥 —— 地形/坐标/领土/火情/辐射/野生总量
 *  （只在长按瞬间计算一次，不跟随帧刷新；野生动物为全局非文明种族存活数） */
function buildGazeText(wx: number, wy: number): string {
  const engine = getEngine();
  const ti = Math.floor(wy) * 256 + Math.floor(wx);
  const parts: string[] = [TERRAIN_NAMES[engine.terrain[ti]] ?? '未知', `(${Math.floor(wx)},${Math.floor(wy)})`];
  const owner = engine.owner[ti] >= 0 ? engine.civs[engine.owner[ti]] : null;
  if (owner?.alive) parts.push(`领土 · ${owner.name}`);
  if (engine.fire[ti] > 0) parts.push('燃烧中');
  if (engine.radiate[ti] > 0) parts.push('辐射');
  let wild = 0;
  for (const u of engine.units) {
    if (u.dead) continue;
    const def = RACES[u.race];
    if (def && !def.isCiv) wild++;
  }
  if (wild > 0) parts.push(`野生动物 ${wild}`);
  return parts.join(' · ');
}

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  // 框选矩形 DOM 直写节点【75 性能】：拖动期间由指针事件直改 style，零 React 重渲染
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  // 光标随工具切换：查看工具 = 抓手（拖地图），其他 = 十字准星（施放）；
  // 群组传送挂起时 = copy（提示「点这里落位」）
  const tool = useGameStore((s) => s.tool);
  const pendingGroupAction = useGameStore((s) => s.pendingGroupAction);
  // P3：神之手指 = grab 光标（抓取中由事件侧直写 grabbing，见 onPointerDown/Up）
  const cursor = pendingGroupAction === 'teleport' ? 'copy' : tool === 'finger' || tool === 'select' ? 'grab' : 'crosshair';
  // 框选门控 ref：主 effect 依赖数组为 []（闭包不重建）——
  // 真实的「已拖出矩形」判定必须走 ref（DOM 矩形节点只负责视觉渲染）
  const selRectRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // alpha:false —— 主画布每帧都被 DEEP_BG 全幅打底，不透明画布可跳过合成器的
    // alpha 混合通道（移动端 GPU 带宽敏感，属零视觉差异的纯收益）
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const engine = getEngine();
    const store = useGameStore.getState();
    (window as unknown as { __wbEngine?: unknown }).__wbEngine = engine;
    // QA/调试句柄：音频引擎（季节环境音确定性验证用，与 __wbEngine 同款模式）
    (window as unknown as { __wbSfx?: unknown }).__wbSfx = sfx;

    // 【75 指挥模式】复杂交互总门控：简洁模式（默认）只保留 拖动平移 / 滚轮·双指缩放 /
    // 工具施放 / 点选检查器；框选 / 右键·长按菜单 / 凝视 / 悬停芯片 / 命令面板 / 书签
    // 均需开启指挥模式（右侧浮动开关或 X 键）后才生效 —— 高频热路径上只多一次布尔读
    const cm = () => useGameStore.getState().commandMode;

    // 【75 性能】框选矩形 DOM 直写（display + 几何四值；拖动全程零 React 重渲染）
    const showMarquee = (x0: number, y0: number, x1: number, y1: number) => {
      const el = marqueeRef.current;
      if (!el) return;
      el.style.display = 'block';
      el.style.left = `${Math.min(x0, x1)}px`;
      el.style.top = `${Math.min(y0, y1)}px`;
      el.style.width = `${Math.abs(x1 - x0)}px`;
      el.style.height = `${Math.abs(y1 - y0)}px`;
    };
    const hideMarquee = () => {
      const el = marqueeRef.current;
      if (el) el.style.display = 'none';
    };

    engine.onStats = (s) => useGameStore.getState().setStats(s);
    // —— 事件/浮层合帧【性能修复 v74】——
    // 极速世界的事件洪流（20x 下战争年代一秒十余条）不再逐条写 store + 排过期定时器：
    // 150ms 窗口合并为一次 flush（纪事流/浮层/灵动岛脉冲对人眼无延迟差异）。
    // 窗口内事件取最新一份（纪事以新为尊）；浮层按信号强度取最多 2 条（war/danger 优先），
    // 洪水期信息不堆叠 —— 4 条显示上限 + 4.2s 消散本来就是「最新最重要」语义。
    let evPending: WorldEvent[] | null = null;
    let evTimer = 0;
    const flushEvents = () => {
      evTimer = 0;
      if (evPending) {
        const batch = evPending;
        evPending = null;
        useGameStore.getState().setEvents(batch);
      }
    };
    engine.onEvent = (events) => {
      evPending = events;
      if (!evTimer) evTimer = window.setTimeout(flushEvents, 150);
    };
    let toastBuf: { text: string; tone: ToastMsg['tone']; op?: boolean }[] = [];
    let toastTimer = 0;
    const flushToasts = () => {
      toastTimer = 0;
      if (!toastBuf.length) return;
      const batch = toastBuf;
      toastBuf = [];
      const st = useGameStore.getState();
      // 信号强度排序：war/danger > good > info；op 回执类垫底（本就不进脉冲）
      const rank = (t: { tone: ToastMsg['tone']; op?: boolean }) =>
        t.op ? 0 : t.tone === 'war' || t.tone === 'danger' ? 3 : t.tone === 'good' ? 2 : 1;
      batch.sort((a, b) => rank(b) - rank(a));
      for (const t of batch.slice(0, 2)) st.pushToast(t.text, t.tone, t.op);
    };
    engine.onToast = (t) => {
      if (toastBuf.length < 8) toastBuf.push({ text: t.text, tone: t.tone, op: t.op });
      if (!toastTimer) toastTimer = window.setTimeout(flushToasts, 150);
    };
    // 引擎音效上报 → WebAudio 合成器（AudioContext 在首次用户手势时初始化）
    engine.onSound = (kind) => sfx.play(kind);
    engine.speed = store.speed;
    engine.brush = store.brush;
    {
      const def = TOOL_BY_ID[store.tool];
      const hasRadius = !!def?.params?.some((p) => p.key === 'radius');
      engine.brushPreview = !!def?.brush || hasRadius || store.tool === 'plague' || store.tool === 'river' || store.tool === 'oasis';
      engine.previewR = hasRadius ? (store.toolParams[store.tool]?.radius ?? null) : null;
    }
    // 画面效果开关（伤害数字/红闪/河流动画/环境氛围）：从持久化的偏好恢复到引擎
    engine.fxPrefs = { ...store.fxPrefs };
    // 世界法则：从持久化的玩家偏好恢复到引擎
    engine.laws = { ...store.laws };
    // 地图覆盖模式（政治版图/温度/湿度）：从持久化偏好恢复，regenerate 后由 render 按需重绘
    engine.overlayMode = store.overlayMode;
    engine.overlayDirty = true;

    // 【75 性能】画布边界矩形缓存：pointermove 是全应用最高频事件（高刷屏 120–240Hz），
    // 旧版每次 move 都 getBoundingClientRect（可能强制布局）。现仅在 手势起点 / resize
    // 失效，getRect 懒重建 —— 手势进行中布局不变，读数稳定可靠
    let rectCache: DOMRect | null = null;
    const getRect = () => (rectCache ??= canvas.getBoundingClientRect());

    const resize = () => {
      rectCache = null; // 75：尺寸变化 = 边界缓存失效
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      sizeRef.current = { w, h };
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ------- input state -------
    let dragging = false;
    let panning = false;
    let lastX = 0;
    let lastY = 0;
    let lastApply = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    let pinchCenter: { x: number; y: number } | null = null;

    // ------- Shift 框选状态 -------
    let selecting = false;
    let selAnchor: { x: number; y: number } | null = null; // 画布内坐标
    let touchSelGesture = false; // 触屏观察工具手势：拖动=框选 / 轻点=点选（回退到 applyAt）

    // ------- 右键菜单判定（右键按下→未拖动→抬起 = 菜单） -------
    let rDown: { x: number; y: number } | null = null;
    let rMoved = false;

    // ------- 惯性滑行（拖拽释放后的速度衰减） -------
    const glide = { vx: 0, vy: 0 };
    let velX = 0;
    let velY = 0;
    let lastMoveT = 0;
    const stopGlide = () => { glide.vx = 0; glide.vy = 0; };
    const stopFollowGroup = () => {
      const st = useGameStore.getState();
      if (st.groupFollow) st.setGroupFollow(false);
    };

    // —— P3 神之手指：抓取/跟随/甩出状态（engine.beginGrab/moveGrab/endGrab 三步 API） ——
    // 速度采样环形缓冲（预分配 6 槽，拖动热路径零分配）：记录最近指针世界坐标/时刻
    let fingerActive = false;
    let fingerTrailN = 0;
    const fingerTrail: { x: number; y: number; t: number }[] = Array.from({ length: 6 }, () => ({ x: 0, y: 0, t: 0 }));
    const fingerPush = (wx: number, wy: number) => {
      const s = fingerTrail[fingerTrailN % 6];
      s.x = wx;
      s.y = wy;
      s.t = performance.now();
      fingerTrailN++;
    };
    const fingerRelease = (vx: number, vy: number) => {
      fingerActive = false;
      canvas.style.cursor = useGameStore.getState().tool === 'finger' ? 'grab' : '';
      try {
        engine.endGrab(vx, vy);
      } catch {
        /* 旧引擎无 endGrab：静默（不影响主循环） */
      }
    };

    // ------- 触屏手势状态（长按菜单 / 双击缩放 / 双指平移） -------
    const isTouch = (e: PointerEvent) => e.pointerType === 'touch';
    let pressTimer: number | null = null;
    let pressStart: { x: number; y: number } | null = null;
    let pressMoved = false;
    let lastTapTime = 0;
    let lastTapPos = { x: 0, y: 0 };

    // ------- Task 70 施法隐身：停手 1.2s 后 HUD 淡入（拖动施放期间持续重置计时） -------
    let castTimer: number | null = null;
    const armCastFade = () => {
      if (castTimer != null) window.clearTimeout(castTimer);
      castTimer = window.setTimeout(() => {
        castTimer = null;
        useGameStore.getState().setCasting(false);
      }, 1200);
    };

    // ------- Task 71 触屏防冲突：交错双指防误施法 -------
    // 双指捏合常以「第一指先落、第二指 10–80ms 后到」的交错节奏开始；旧版第一指落即施放，
    // 用户想缩放却先丢了一颗陨石。现在触屏的初次施放延迟 TOUCH_APPLY_DELAY 生效：
    //   · 第二指在窗口内到达 → 取消本次施放（纯捏合意图）
    //   · 长按（凝视/菜单）触发 → 取消（长按语义优先）
    //   · 提前抬指 → 立即落地（轻点手感不受影响）；拖动绘制类工具不受影响（move 会持续施放）
    const TOUCH_APPLY_DELAY = 70;
    let pendingApply: { timer: number; e: PointerEvent } | null = null;
    const cancelPendingApply = () => {
      if (pendingApply != null) {
        window.clearTimeout(pendingApply.timer);
        pendingApply = null;
      }
    };
    const scheduleTouchApply = (e: PointerEvent) => {
      cancelPendingApply();
      pendingApply = {
        timer: window.setTimeout(() => {
          pendingApply = null;
          // 长按期间已被取消或手势已进化（多指/选点/挂起）则不落地
          if (pointers.size !== 1) return;
          applyAt(e, true);
        }, TOUCH_APPLY_DELAY),
        e,
      };
    };

    const clearPressTimer = () => {
      if (pressTimer != null) {
        window.clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    /** 在屏幕坐标 (cx, cy) 唤起上下文菜单（右键 / 触屏长按共用；菜单组件自取世界坐标做上下文感知） */
    const openMenuAt = (cx: number, cy: number) => {
      const rect = getRect();
      const { w, h } = sizeRef.current;
      const { wx, wy } = engine.screenToWorld(cx - rect.left, cy - rect.top, w, h);
      useGameStore.getState().openCtxMenu(cx, cy, wx, wy);
    };

    /** 长按（480ms 位移 < 14px）：触觉反馈 + 神明 UI 分流（Task 70 造物主凝视）
     *  · 长按空地 → 神之视界气泡（地形/领土/火情/野生一瞥，松手消散；不再弹菜单）
     *  · 长按生灵 → 上下文菜单（查看详情/抹除等操作入口，保持原行为） */
    const onLongPress = (e: PointerEvent) => {
      pressTimer = null;
      cancelPendingApply(); // 长按语义优先：凝视/菜单不吃掉同指的延迟施放
      if (pressMoved || pointers.size !== 1) return;
      // 触觉反馈（支持的设备上轻震一下）
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(24);
        } catch {
          /* 忽略不支持 */
        }
      }
      const st = useGameStore.getState();
      // 选点模式不透视（点击即拾取坐标的语义优先）
      if (!st.picking) {
        const { wx, wy } = worldAt(e);
        const hit = engine.hitUnit(wx, wy);
        if (!hit && wx >= 0 && wy >= 0 && wx < 256 && wy < 160) {
          st.setGaze({ x: e.clientX, y: e.clientY, text: buildGazeText(wx, wy) });
          return;
        }
      }
      // 交互 2.0：长按生灵 = 右键菜单（「查看详情」是菜单第一项，原检查器直达能力保留在菜单内）
      openMenuAt(e.clientX, e.clientY);
    };

    const worldAt = (e: PointerEvent | MouseEvent) => {
      const rect = getRect();
      const { w, h } = sizeRef.current;
      return engine.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, w, h);
    };

    const applyAt = (e: PointerEvent, isDown: boolean) => {
      const st = useGameStore.getState();
      // 地图选点模式（触发器位置拾取）：单次点击直接回填坐标，不应用任何工具；拖动期间也不施放
      if (st.picking) {
        if (isDown) {
          const { wx, wy } = worldAt(e);
          st.pickDone(Math.max(0, Math.min(255, Math.floor(wx))), Math.max(0, Math.min(159, Math.floor(wy))));
          dragging = false;
        }
        return;
      }
      // 群组传送挂起：下一次左键点击 = 群组落位（吃掉本次点击，不施放工具）
      if (st.pendingGroupAction === 'teleport' && isDown) {
        const { wx, wy } = worldAt(e);
        st.setPendingGroupAction(null);
        const ids = st.groupSel;
        let done = 0;
        for (let k = 0; k < ids.length; k++) {
          // 落点小散布（半径 2 格内金三角抖动），避免全员叠在一格
          const ang = (k / Math.max(1, ids.length)) * Math.PI * 2;
          const rr = ids.length > 1 ? 0.6 + (k % 3) * 0.7 : 0;
          if (engine.devTeleportUnit(ids[k], wx + Math.cos(ang) * rr, wy + Math.sin(ang) * rr)) done++;
        }
        st.showInteractNote(`已传送 ${done} 个单位`, 'good');
        dragging = false;
        return;
      }
      const tool = st.tool;
      if (tool === 'select') {
        if (!isDown) return;
        const { wx, wy } = worldAt(e);
        const u = engine.hitUnit(wx, wy);
        if (u) {
          // Task 70 造物主凝视：触屏点选生灵 → 头顶轻气泡（名字/血量/情绪 + 详情入口）；
          // 桌面保持检查器直达（鼠标点选效率优先）。
          // 【75 门控】气泡属复杂交互：简洁模式下触屏点选与桌面一致直达检查器
          if (e.pointerType === 'touch' && st.commandMode) {
            st.setUnitBubble(u.id);
            return;
          }
          st.select(u.id, null);
          return;
        }
        const ti = Math.floor(wy) * 256 + Math.floor(wx);
        if (wx >= 0 && wy >= 0 && wx < 256 && wy < 160 && engine.owner[ti] >= 0) {
          st.selectCiv(engine.owner[ti]);
        } else {
          st.select(null, null);
        }
        return;
      }
      const th = throttleFor(tool);
      if (th === -1 && !isDown) return; // single-shot tools only on pointerdown
      const now = performance.now();
      if (th > 0 && now - lastApply < th) return;
      lastApply = now;
      const { wx, wy } = worldAt(e);
      // —— 撤销快照：施放前捕获（幂等；拖拽 stroke 全程共用一份前态） ——
      beginStroke();
      // 放置参数（数量/半径/强度/持续）随工具一起传给引擎
      engine.applyTool(tool, wx, wy, st.toolParams[tool]);
      // Task 70 施法隐身：施放期间移动端 HUD 淡出（只留画布与范围圈），停手 1.2s 淡入
      st.setCasting(true);
      armCastFade();
      // —— 单发工具即时落栈（同步 diff：零 tick 间隔，单位生死追认零漏报） ——
      const def = TOOL_BY_ID[tool];
      if (def?.single) endStroke(def.label ?? tool, true);
    };

    const onPointerDown = (e: PointerEvent) => {
      // 浏览器音频策略：任何用户手势都可以激活 AudioContext
      sfx.ensureInit();
      // 上下文菜单打开时：点画布 = 只关菜单，吃掉本次点击（不误施放工具）
      {
        const stNow = useGameStore.getState();
        if (stNow.ctxMenu) {
          stNow.closeCtxMenu();
          return;
        }
        // Task 70 神明 UI：点画布即收手势盘抽屉（「选工具 → 点地图放置」一步到位，不阻断本次施放）
        if (stNow.divineOpen) stNow.setDivineOpen(false);
        // 触屏单位气泡：点画布任意处收起（若点中另一生灵，applyAt 会随即设置新气泡）
        if (stNow.unitBubble != null) stNow.setUnitBubble(null);
      }
      // 任何新的指针输入都打断惯性滑行与镜头飞行
      stopGlide();
      cancelFlight();
      // 指针捕获可能因合成事件/已失效指针抛 NotFoundError — 捕获后继续处理点击
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 忽略：不影响拖动与工具应用 */
      }
      // 【75 性能】新手势起点 = 边界缓存失效（首次 getRect 懒重建；手势中布局不变）
      rectCache = null;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // 双指手势开始：取消拖动/长按/框选/延迟施放，记录捏合基线；凝视同步消散（二指=捏合意图）
        dragging = false;
        selecting = false;
        selAnchor = null;
        hideMarquee();
        clearPressTimer();
        cancelPendingApply();
        {
          const stG = useGameStore.getState();
          if (stG.gaze) stG.setGaze(null);
        }
        const pts = [...pointers.values()];
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        // 第二指落下 = 捏合意图：神之手指轻放收尾（防抓着单位捏合缩放）
        if (fingerActive) fingerRelease(0, 0);
        return;
      }
      if (e.button === 1 || e.button === 2) {
        // 右键/中键：拖动 = 平移；右键「原地点击」= 上下文菜单（抬起时判定）
        panning = true;
        rDown = e.button === 2 ? { x: e.clientX, y: e.clientY } : null;
        rMoved = false;
        lastX = e.clientX;
        lastY = e.clientY;
        lastMoveT = performance.now();
        velX = 0;
        velY = 0;
        clearPressTimer();
        return;
      }
      if (e.button === 0) {
        // —— P3 神之手指：按住抓起最近生物（最高优先级：跳过框选/群组清除/工具施放） ——
        {
          const stF = useGameStore.getState();
          if (stF.tool === 'finger' && !stF.picking && stF.pendingGroupAction == null) {
            const { wx, wy } = worldAt(e);
            fingerTrailN = 0;
            fingerPush(wx, wy);
            fingerActive = true;
            canvas.style.cursor = 'grabbing';
            try {
              engine.beginGrab(wx, wy);
            } catch {
              /* 旧引擎无 beginGrab：静默 */
            }
            return;
          }
        }
        // —— Shift + 左键拖拽 = 框选单位（交互 2.0；原 Shift 平移由右键/中键承担） ——
        // —— 触屏 + 观察工具：单指拖动 = 框选（RTS 手游惯例；触屏无 Shift 键的等价入口） ——
        // 【75 门控】框选属复杂交互：简洁模式下 Shift 拖动 / 触屏拖动走普通语义
        //    （select 工具 = 平移，其他工具 = 施放），杜绝「一拖就框选」的混乱误触
        const touchSelect = isTouch(e) && useGameStore.getState().tool === 'select';
        if ((e.shiftKey || touchSelect) && cm() && !useGameStore.getState().picking) {
          selecting = true;
          touchSelGesture = touchSelect;
          const rect = getRect();
          selAnchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          selRectRef.current = null; // 拖出 >4px 才显示，避免单击闪烁
          hideMarquee();
          clearPressTimer();
          // 触屏观察手势仍保留长按菜单（拖动 >14px 会轻 pressMoved 取消；原地长按 → 菜单）
          if (touchSelect) {
            pressMoved = false;
            pressStart = { x: e.clientX, y: e.clientY };
            pressTimer = window.setTimeout(() => onLongPress(e), 480);
          }
          return;
        }
        const st = useGameStore.getState();
        // 已有选中群组时：普通左键点击 = 清除群组并吃掉本次点击（RTS 惯例）；
        // 群组传送挂起时除外——该点击是落位指令，交由 applyAt 的传送分支处理
        if (st.groupSel.length && st.pendingGroupAction == null) {
          st.clearGroupSel();
          return;
        }
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        lastMoveT = performance.now();
        velX = 0;
        velY = 0;
        // 触屏：初次施放延迟 70ms（防交错双指误施法）；鼠标保持即时
        if (isTouch(e)) scheduleTouchApply(e);
        else applyAt(e, true);
        // 触屏长按检测：480ms 内位移 < 14px → 上下文菜单（选点模式禁用：点击即拾取坐标）
        // 【75 门控】长按菜单/凝视属复杂交互：简洁模式下长按无任何副作用
        if (isTouch(e) && cm() && !useGameStore.getState().picking) {
          pressMoved = false;
          pressStart = { x: e.clientX, y: e.clientY };
          clearPressTimer();
          pressTimer = window.setTimeout(() => onLongPress(e), 480);
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      // 已跟踪指针原位更新（避免每次 move 都 new {x,y} —— 高频事件热路径零分配）
      const pt = pointers.get(e.pointerId);
      if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
      else pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const { wx, wy } = worldAt(e);
      // 光标对象复用：直接改字段而非重建对象（render 每帧读取，字段语义不变）
      const cur = engine.cursor;
      cur.wx = wx;
      cur.wy = wy;
      cur.on = true;

      // 长按位移检测：超出 14px 取消长按
      if (pressStart && !pressMoved) {
        if (Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 14) {
          pressMoved = true;
          clearPressTimer();
        }
      }

      // —— Shift 框选进行中：更新选择矩形（画布内坐标），不走平移/施放 ——
      // 【75 性能】矩形直写 DOM（display + left/top/width/height），拖动全程零 React 重渲染
      if (selecting && selAnchor) {
        const rect = getRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (Math.hypot(x - selAnchor.x, y - selAnchor.y) > 4) {
          selRectRef.current = { x0: selAnchor.x, y0: selAnchor.y, x1: x, y1: y };
          showMarquee(selAnchor.x, selAnchor.y, x, y);
        }
        return;
      }

      // —— 悬停信息芯片（仅鼠标；50ms 节流；无菜单/无面板/无挂起动作时） ——
      // 【75 门控+性能】简洁模式下整体停算：免去每 50ms 一次全单位最近邻扫描（交互热路径最大单点开销）
      if (e.pointerType === 'mouse' && cm()) {
        hoverChip(e, wx, wy);
      }

      if (pointers.size === 2) {
        // 双指手势：捏合缩放 + 双指平移（中心点位移）同时生效
        // 【75 性能】Map 迭代器直取两点，免 [...spread] 每次 move 的数组分配
        //（size===2 已保证两次 next 都取到值，断言仅安抚严格模式的 undefined 收窄）
        const pit = pointers.values();
        const pa = pit.next().value as { x: number; y: number };
        const pb = pit.next().value as { x: number; y: number };
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        const cx2 = (pa.x + pb.x) / 2;
        const cy2 = (pa.y + pb.y) / 2;
        if (pinchCenter) {
          engine.pan(pinchCenter.x - cx2, pinchCenter.y - cy2);
        }
        pinchCenter = { x: cx2, y: cy2 };
        if (pinchDist > 0) {
          const rect = getRect();
          const ccx = cx2 - rect.left;
          const ccy = cy2 - rect.top;
          const { w, h } = sizeRef.current;
          engine.zoomAt(ccx, ccy, d / pinchDist, w, h);
        }
        pinchDist = d;
        return;
      }

      // —— P3 神之手指拖动：被抓单位跟随指针 + 速度采样（不施放/不平移/不框选） ——
      if (fingerActive) {
        fingerPush(wx, wy);
        try {
          engine.moveGrab(wx, wy);
        } catch {
          /* 旧引擎无 moveGrab：静默 */
        }
        return;
      }

      if (panning) {
        const now = performance.now();
        const dtm = Math.max(1, now - lastMoveT);
        // EMA 记录平移速度（px/ms）供释放后惯性滑行
        velX = velX * 0.55 + ((lastX - e.clientX) / dtm) * 0.45;
        velY = velY * 0.55 + ((lastY - e.clientY) / dtm) * 0.45;
        lastMoveT = now;
        engine.pan(lastX - e.clientX, lastY - e.clientY);
        // 右键拖动超过阈值 → 标记已拖动（抬起不弹菜单）
        if (rDown && Math.hypot(e.clientX - rDown.x, e.clientY - rDown.y) > 6) rMoved = true;
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      // 查看工具拖拽 = 平移（鼠标与触屏统一：点选后拖动即可移动视野）
      if (dragging && useGameStore.getState().tool === 'select') {
        const now = performance.now();
        const dtm = Math.max(1, now - lastMoveT);
        velX = velX * 0.55 + ((lastX - e.clientX) / dtm) * 0.45;
        velY = velY * 0.55 + ((lastY - e.clientY) / dtm) * 0.45;
        lastMoveT = now;
        engine.pan(lastX - e.clientX, lastY - e.clientY);
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      if (dragging) applyAt(e, false);
    };

    /** 框选收尾：世界 AABB 内存活单位（≤200）入群组 */
    const finishBoxSelect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const x0 = Math.max(0, Math.min(a.x, b.x));
      const x1 = Math.min(255, Math.max(a.x, b.x));
      const y0 = Math.max(0, Math.min(a.y, b.y));
      const y1 = Math.min(159, Math.max(a.y, b.y));
      const ids: number[] = [];
      for (const u of engine.units) {
        if (u.dead) continue;
        if (u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) {
          ids.push(u.id);
          if (ids.length >= BOX_SELECT_CAP) break;
        }
      }
      const st = useGameStore.getState();
      if (ids.length === 0) {
        st.showInteractNote('框内没有生物', 'info');
        return;
      }
      if (ids.length >= BOX_SELECT_CAP) {
        st.showInteractNote(`框内生物过多，已选取前 ${BOX_SELECT_CAP} 个`, 'info');
      }
      st.setGroupSel(ids);
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      // 提前抬指（<70ms 轻点）：延迟施放立即落地，轻点手感不受窗口影响
      if (pendingApply != null && pendingApply.e.pointerId === e.pointerId) {
        const ev = pendingApply.e;
        cancelPendingApply();
        if (pointers.size === 0 && !pressMoved) applyAt(ev, true);
      }
      if (pointers.size < 2) {
        pinchDist = 0;
        pinchCenter = null;
      }
      // —— P3 神之手指收尾：最近 ~120ms 位移 → 甩出速度（世界格/帧；轻放阈值 0.35 由引擎判定） ——
      if (fingerActive) {
        const nowU = performance.now();
        const lastS = fingerTrail[Math.max(0, fingerTrailN - 1) % 6];
        let oldX = lastS.x;
        let oldY = lastS.y;
        let oldT = lastS.t;
        for (let k = 2; k <= 6 && k <= fingerTrailN; k++) {
          const s = fingerTrail[(fingerTrailN - k) % 6];
          if (nowU - s.t > 120) break; // 只取最近 120ms 窗口（防旧样本拖慢速度）
          oldX = s.x;
          oldY = s.y;
          oldT = s.t;
        }
        const dtm = Math.max(16, nowU - oldT);
        fingerRelease(((lastS.x - oldX) / dtm) * 16, ((lastS.y - oldY) / dtm) * 16);
      }
      // —— Shift 框选收尾 ——
      if (selecting && selAnchor) {
        const rect = getRect();
        const ptB = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        if (selRectRef.current) {
          const { wx: ax, wy: ay } = toWorld(selAnchor.x, selAnchor.y, sizeRef.current.w, sizeRef.current.h);
          const { wx: bx, wy: by } = toWorld(ptB.x, ptB.y, sizeRef.current.w, sizeRef.current.h);
          finishBoxSelect({ x: ax, y: ay }, { x: bx, y: by });
        } else if (touchSelGesture && e.button === 0 && !useGameStore.getState().ctxMenu) {
          // 触屏观察工具轻点（未拖出矩形）→ 回退为点选（单位/领土/清空）；长按已弹菜单则不吃这次抬手
          applyAt(e, true);
        }
        selecting = false;
        touchSelGesture = false;
        selAnchor = null;
        selRectRef.current = null;
        hideMarquee();
      } else if (selecting) {
        selecting = false;
        touchSelGesture = false;
        selAnchor = null;
        selRectRef.current = null;
        hideMarquee();
      }
      // —— 右键原地点击 = 上下文菜单（未拖动时）——
      // 【75 门控】简洁模式不弹菜单（右键拖动平移不受影响 —— 平移属基础「拖动」）
      if (e.button === 2 && rDown && !rMoved) {
        const st = useGameStore.getState();
        // 选点模式与群组传送挂起时不弹菜单（保持既有拾取语义）
        if (st.commandMode && !st.picking && st.pendingGroupAction == null) openMenuAt(e.clientX, e.clientY);
      }
      rDown = null;
      // —— 惯性滑行：释放时速度足够则启动（~300ms 衰减；键盘/新指针/滚轮会打断） ——
      if (pointers.size === 0 && (panning || dragging)) {
        const sp = Math.hypot(velX, velY);
        if (sp > 0.22) {
          const cap = Math.min(1, 2.2 / sp); // 限幅防甩飞
          glide.vx = velX * cap;
          glide.vy = velY * cap;
        }
        velX = 0;
        velY = 0;
      }
      // 触屏轻点检测：双击（320ms 内 < 40px）→ 就地放大（仅观察模式：施法工具下双击是连续施放，不缩放防镜头跳变）
      if (isTouch(e) && !pressMoved && e.button === 0 && useGameStore.getState().tool === 'select') {
        const now = performance.now();
        if (now - lastTapTime < 320 && Math.hypot(e.clientX - lastTapPos.x, e.clientY - lastTapPos.y) < 40) {
          const rect = getRect();
          const { w, h } = sizeRef.current;
          engine.zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1.8, w, h);
          lastTapTime = 0; // 重置：三击不触发连缩
        } else {
          lastTapTime = now;
          lastTapPos = { x: e.clientX, y: e.clientY };
        }
      }
      clearPressTimer();
      pressStart = null;
      pressMoved = false;
      // Task 70 神之视界：松手消散（造物主收回凝视）
      {
        const stG = useGameStore.getState();
        if (stG.gaze) stG.setGaze(null);
      }
      if (pointers.size === 0) {
        dragging = false;
        panning = false;
        // —— 拖拽 stroke 撤销落栈（单发工具已在 applyAt 内即时落栈，此处幂等） ——
        if (strokeActive()) {
          const st = useGameStore.getState();
          const label = TOOL_BY_ID[st.tool]?.label ?? st.tool;
          endStroke(label, false);
        }
        // 施法隐身收尾：最后一指抬起 1.2s 后 HUD 淡入
        if (useGameStore.getState().casting) armCastFade();
      }
    };

    // —— 悬停芯片（模块级节流 + 去抖：文本/位置未变不写 store，防闪烁） ——
    let lastHoverT = 0;
    let lastHoverKey = '';
    const hoverChip = (e: PointerEvent, wx: number, wy: number) => {
      // 仅画布聚焦且无框选/菜单/面板/挂起动作时显示（任务书规约）；
      // 调用点已按【75 门控】限定指挥模式，此处再校验一次（防御未来新增调用点）
      if (selecting || dragging || panning) return;
      const st = useGameStore.getState();
      if (!st.commandMode || st.ctxMenu || st.paletteOpen || st.pendingGroupAction || st.keymapOpen) return;
      const now = performance.now();
      if (now - lastHoverT < HOVER_THROTTLE) return;
      lastHoverT = now;
      let text: string;
      const u = engine.hitUnit(wx, wy);
      if (u) {
        const race = RACES[u.race];
        const civ = u.civ >= 0 ? engine.civs[u.civ] : null;
        text = `${u.name} · ${race?.name ?? '?'} · ${Math.ceil(u.hp)}/${u.maxHp}${civ?.alive ? ` · ${civ.name}` : ''}`;
      } else if (wx >= 0 && wy >= 0 && wx < 256 && wy < 160) {
        const ti = Math.floor(wy) * 256 + Math.floor(wx);
        text = `${TERRAIN_NAMES[engine.terrain[ti]] ?? '未知'} · (${Math.floor(wx)},${Math.floor(wy)})`;
      } else {
        text = '界外';
      }
      // 去抖：位置移动 <2px 且文本相同 → 不更新（芯片静止时不重渲染）
      const key = `${text}@${Math.round(e.clientX / 3)},${Math.round(e.clientY / 3)}`;
      if (key === lastHoverKey) return;
      lastHoverKey = key;
      st.setHoverInfo({ x: e.clientX + 12, y: e.clientY + 12, text });
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopGlide();
      cancelFlight();
      const rect = getRect(); // 75：触控板捏合 = 高频 wheel，同样走缓存
      const { w, h } = sizeRef.current;
      // 幅值感知缩放：触控板捏合/平滑滚轮会以高频喷出小 delta 事件，
      // 旧版「每个事件固定 ×1.18」在这些设备上复利爆炸——放到一半突然暴涨的元凶。
      // 现按 delta 大小成比例缩放（标准滚轮一格 deltaY≈100 → ×1.18 不变手感），
      // 单事件步长钳制防过冲；配合引擎侧指数缓动（zoomAnim），任何输入都是平滑推拉。
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 33; // 行模式（Firefox）
      else if (e.deltaMode === 2) dy *= 100; // 页模式
      const factor = Math.max(0.72, Math.min(1.4, Math.exp(-dy * 0.00165)));
      engine.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor, w, h);
    };

    const onLeave = () => {
      engine.cursor.on = false;
      useGameStore.getState().setHoverInfo(null);
      lastHoverKey = '';
    };

    const onContext = (e: Event) => e.preventDefault();

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const st = useGameStore.getState();
      // 交互 2.0 新键位仅在游戏场景生效（标题屏/摄影模式不受打扰）
      const inGame = st.boot === 'game' && !st.cinema;
      if (inGame) {
        // —— X：指挥模式总开关【75】：复杂交互（框选/右键菜单/长按/命令面板/书签）一键启停 ——
        if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          st.toggleCommandMode();
          return;
        }
        // —— Ctrl+Z / Ctrl+Shift+Z：撤销 / 重做（【75】安全网键位：简洁模式同样可用） ——
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          const label = e.shiftKey ? redo() : undo();
          st.showInteractNote(
            label ? `${e.shiftKey ? '已重做' : '已撤销'}：${label}` : '没有可撤销的神力操作',
            label ? 'good' : 'info',
          );
          return;
        }
        // —— Ctrl+Y：重做（等效 Ctrl+Shift+Z） ——
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          const label = redo();
          st.showInteractNote(label ? `已重做：${label}` : '没有可重做的操作', label ? 'good' : 'info');
          return;
        }
        // —— Esc 优先级链：面板 → 速查 → 菜单 → 挂起动作 → 群组 →（既有）选点/选择 ——
        // 【75】关浮层永远合法（简洁模式下这些浮层本就不可能存在，防御性保留）
        if (e.key === 'Escape') {
          if (st.paletteOpen) { st.setPaletteOpen(false); return; }
          if (st.keymapOpen) { st.setKeymapOpen(false); return; }
          if (st.ctxMenu) { st.closeCtxMenu(); return; }
          if (st.pendingGroupAction) { st.setPendingGroupAction(null); st.showInteractNote('已取消传送', 'info'); return; }
          if (st.groupSel.length) { st.clearGroupSel(); return; }
        }
        // —— 【75 门控】以下进阶键位仅指挥模式生效：命令面板 / 键位速查 / 镜头书签 ——
        if (st.commandMode) {
          // —— Ctrl+K：命令面板 ——
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            st.setPaletteOpen(!st.paletteOpen);
            return;
          }
          // —— ?（Shift+/）：键位速查浮层 ——
          if (e.key === '?') {
            e.preventDefault();
            st.setKeymapOpen(!st.keymapOpen);
            return;
          }
          // —— 镜头书签：Shift+数字 存 / Alt+数字 跳（Ctrl+数字为浏览器标签页保留键，
          //    能收到的环境里等效保存；裸数字 1/2/3 保持速度控制。详见 keymap.ts 审计注） ——
          const dg = /^Digit([1-9])$/.exec(e.code);
          if (dg) {
            const n = Number(dg[1]);
            if (e.altKey && !e.shiftKey) {
              e.preventDefault();
              if (!jumpBookmark(n)) st.showInteractNote(`镜头 ${n} 还没有书签（Shift+${n} 保存）`, 'info');
              return;
            }
            if ((e.shiftKey || e.ctrlKey || e.metaKey) && !e.altKey) {
              e.preventDefault();
              if (saveBookmark(n)) st.showInteractNote(`镜头 ${n} 已保存（Alt+${n} 飞回）`, 'good');
              return;
            }
            // 无修饰符 → 落入下方既有速度控制
          }
        }
      }
      // —— Alt+↑/↓：无极调速微调（±0.5，钳 0.1–20；Task 71）——
      // 提前于 keys.add：Alt+方向不进入平移键集合（调速与移镜头互斥）
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const cur = st.speed;
        if (e.key === 'ArrowUp') st.setSpeed(Math.min(20, Math.max(0.1, cur + 0.5)));
        else st.setSpeed(cur <= 0.5 ? 0 : Math.max(0, cur - 0.5)); // 降到 0.5 再降 = 暂停
        return;
      }
      keys.add(e.key.toLowerCase());
      // 既有键位（保持原语义；新增修饰键守卫：Ctrl+C/H 等组合不再误触）
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        st.togglePause();
      }
      // 选点模式中：Esc 取消选点（不关闭检查器，避免误触双动作）
      if (e.key === 'Escape' && st.picking) {
        st.cancelPick();
        return;
      }
      if (e.key === 'Escape') st.select(null, null);
      if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) st.toggleHelp();
      // 摄影模式开关：C 键（隐藏/恢复全部 UI，纯净画面观察世界）
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) st.toggleCinema();
      if (e.key === '1') st.setSpeed(1);
      if (e.key === '2') st.setSpeed(3);
      if (e.key === '3') st.setSpeed(8);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ------- main loop -------
    let raf = 0;
    let last = performance.now();
    // 环境音乐情绪低频接线（Task 42-e）：帧计数器节流，每 60 帧（约 1s）同步一次昼夜/季节/战争/暂停
    let moodFrame = 0;
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(100, now - last);
      last = now;
      // keyboard pan
      const panSpeed = 12 / engine.cam.zoom * (dt / 16);
      let dx = 0;
      let dy = 0;
      if (keys.has('arrowleft') || keys.has('a')) dx -= panSpeed * 10;
      if (keys.has('arrowright') || keys.has('d')) dx += panSpeed * 10;
      if (keys.has('arrowup') || keys.has('w')) dy -= panSpeed * 10;
      if (keys.has('arrowdown') || keys.has('s')) dy += panSpeed * 10;
      if (dx || dy) {
        stopGlide();
        cancelFlight();
        stopFollowGroup();
        engine.pan(dx, dy);
      }
      // —— 惯性滑行（拖拽释放后 ~300ms 速度衰减；速度过小即停） ——
      if (glide.vx !== 0 || glide.vy !== 0) {
        stopFollowGroup();
        engine.pan(glide.vx * dt, glide.vy * dt);
        const f = Math.exp(-dt / 110);
        glide.vx *= f;
        glide.vy *= f;
        if (Math.hypot(glide.vx, glide.vy) < 0.02) stopGlide();
      }
      // —— 镜头书签飞行（easeOutCubic ~400ms；用户任何镜头输入已在上文打断） ——
      tickFlight();
      // —— 群组跟随：镜头平滑追踪群组质心（与引擎单单位跟随互斥） ——
      {
        const st = useGameStore.getState();
        if (st.groupFollow && st.groupSel.length > 0) {
          let cx = 0;
          let cy = 0;
          let n = 0;
          for (const id of st.groupSel) {
            const u = engine.unitById.get(id);
            if (u && !u.dead) { cx += u.x; cy += u.y; n++; }
          }
          if (n > 0) {
            cx /= n;
            cy /= n;
            const k = 1 - Math.exp(-dt / 150);
            engine.followId = null;
            engine.cam.x += (cx - engine.cam.x) * k;
            engine.cam.y += (cy - engine.cam.y) * k;
            engine.clampCam();
          } else {
            st.setGroupFollow(false);
          }
        }
      }

      try {
        // 摄影模式同步到引擎（渲染层隐藏编辑器标记与战争暗角，保持画面纯净）
        engine.cinemaMode = useGameStore.getState().cinema;
        engine.frame(dt);
        const { w, h } = sizeRef.current;
        // 性能仪表（Task 42-a）：渲染路径耗时与帧率 EMA —— 只写引擎实例字段，
        // 不走 zustand（避免高频更新引发重渲染风暴），后续性能 HUD 自行低频轮询
        const r0 = performance.now();
        render(engine, ctx, w, h);
        const dms = performance.now() - r0;
        const p = engine.perf;
        p.drawMs = p.drawMs > 0 ? p.drawMs * 0.9 + dms * 0.1 : dms;
        const instFps = 1000 / Math.max(1, dt);
        p.fps = p.fps > 0 ? p.fps * 0.9 + instFps * 0.1 : instFps;
      } catch (err) {
        // keep the loop alive and surface the error once
        console.error('[WB-RENDER]', err);
      }
      // 环境音乐情绪：帧计数节流（每 60 帧一次，非每帧）——昼/夜=dayPhase、季节=nature.season、
      // 战争=世界大战进行中或存在交战关系（rel < -20 同 devStats 口径，some 短路）、暂停=引擎速度为 0
      if (++moodFrame >= 60) {
        moodFrame = 0;
        let atWar = engine.worldWar.phase === 'running';
        if (!atWar) {
          for (const v of engine.rel.values()) {
            if (v < -20) {
              atWar = true;
              break;
            }
          }
        }
        const dp = engine.dayPhase();
        sfx.setMood({ night: dp >= 0.52 && dp < 0.88, season: engine.nature.season, war: atWar, paused: engine.speed === 0 });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // first-visit 引导已由标题屏 + Onboarding 六步教程接管（Task 42-c）；
    // 旧的「首访自动弹帮助」会与引导卡叠加造成首次体验过载，已移除

    // 60 秒自动存档（静默写入，不弹 toast）
    const autoTimer = window.setInterval(() => {
      useGameStore.getState().saveGame('auto');
    }, AUTOSAVE_MS);

    return () => {
      if (evTimer) window.clearTimeout(evTimer);
      if (toastTimer) window.clearTimeout(toastTimer);
      cancelAnimationFrame(raf);
      window.clearInterval(autoTimer);
      if (castTimer != null) window.clearTimeout(castTimer);
      cancelPendingApply();
      cancelStroke(); // 卸载时丢弃未落栈的快照
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // 【75 性能】框选可视化改为常驻 DOM 节点直写（display + 几何四值）：
  // 拖动全程零 React 重渲染；hidden 类兜底初始态（display:none），inline style 覆盖优先生效
  return (
    <>
      <canvas
        ref={canvasRef}
        data-wb-main-canvas
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor }}
      />
      <div
        ref={marqueeRef}
        aria-hidden
        className="pointer-events-none absolute z-40 hidden border-2 border-amber-300/90 bg-amber-400/15"
      />
    </>
  );
}
