// ============ 统一键位注册表（Task 45-b 交互体系 2.0） ============
// 单一事实来源：既有键位（GameCanvas / gameStore 实况审计）与交互 2.0 新增键位
// 全部集中注册于此。? 速查浮层（KeymapOverlay）与世界法典「快捷键」页（HelpDialog）
// 均消费本注册表——改键只改这里，两处展示自动同步。
//
// —— 既有键位审计结论（2024 代码实况，GameCanvas.tsx onKeyDown）——
//   空格=暂停 | 1/2/3=速度 1x/3x/8x | H=世界法典 | C=摄影模式 | Esc=取消选点/选择
//   WASD/方向键=镜头平移 | 滚轮=缩放 | 右键/中键/Shift+左键拖动=平移（旧）
// —— 冲突处理记录 ——
//   · Shift+左键拖动 原为「平移」→ 2.0 改为「框选」（本任务书明确要求），
//     平移仍可由 右键/中键拖动 完成，键位表已同步更新；
//   · 镜头书签 原方案 Ctrl+数字（保存）/ 裸数字（跳转）均不可用：
//     - 裸数字 1/2/3 已被速度控制占用（见上）；
//     - Ctrl+1..8 是浏览器保留快捷键（切换标签页），页面永远收不到事件；
//     → 改用 Shift+数字（保存）/ Alt+数字（跳转），以 e.code 识别不受输入法影响。

export type KeymapGroup = '指针与镜头' | '时间与面板' | '指挥模式' | '触屏手势';

export const KEYMAP_GROUP_ORDER: KeymapGroup[] = ['指针与镜头', '时间与面板', '指挥模式', '触屏手势'];

export interface KeymapEntry {
  /** 稳定 id（文档/E2E 用） */
  id: string;
  /** 展示键帽组（与 HelpDialog 既有 Kbd 风格配合） */
  keys: string[];
  /** 功能说明 */
  desc: string;
  /** 分组 */
  group: KeymapGroup;
  /** 是否需要游戏场景（boot=game 且非摄影模式）内才生效——速查浮层会分组展示 */
  inGame?: boolean;
}

const ENTRIES: KeymapEntry[] = [
  // ---------------- 指针与镜头（既有；简洁模式即全量可用） ----------------
  { id: 'pointer.tool', keys: ['左键', '拖动'], desc: '使用当前工具（刷生物、画地形、降天灾）', group: '指针与镜头' },
  { id: 'pointer.pan', keys: ['右键', '中键', '拖动'], desc: '平移视野（松手后带惯性滑行；查看工具下左键拖动也可平移）', group: '指针与镜头' },
  { id: 'pointer.zoom', keys: ['滚轮'], desc: '缩放世界（以鼠标位置为锚点平滑推拉）', group: '指针与镜头' },
  { id: 'keys.pan', keys: ['WASD', '方向键'], desc: '移动镜头', group: '指针与镜头' },

  // ---------------- 时间与面板（既有） ----------------
  { id: 'time.pause', keys: ['空格'], desc: '暂停 / 继续', group: '时间与面板' },
  { id: 'time.speed', keys: ['1', '2', '3'], desc: '速度 1x / 3x / 8x', group: '时间与面板' },
  { id: 'panel.help', keys: ['H'], desc: '打开世界法典（帮助）', group: '时间与面板' },
  { id: 'panel.cinema', keys: ['C'], desc: '摄影模式（隐藏全部界面）', group: '时间与面板' },
  { id: 'panel.esc', keys: ['Esc'], desc: '关闭浮层 / 取消框选与选点 / 取消选择', group: '时间与面板' },

  // ---------------- 指挥模式（75：复杂交互总开关，开启后才生效） ----------------
  { id: 'interact.commandmode', keys: ['X'], desc: '指挥模式总开关 —— 开启后解锁框选 / 右键菜单 / 长按凝视 / 命令面板 / 镜头书签；关闭回到简洁模式（仅拖动·缩放·施放），并自动清扫全部交互浮层', group: '指挥模式', inGame: true },
  { id: 'interact.palette', keys: ['Ctrl', 'K'], desc: '命令面板 — 工具 / 面板 / 速度 / 存档 / 镜头跳转一网打尽（需指挥模式）', group: '指挥模式', inGame: true },
  { id: 'interact.keymap', keys: ['?'], desc: '键位速查浮层（Shift + /，即本页；需指挥模式）', group: '指挥模式', inGame: true },
  { id: 'interact.ctxmenu', keys: ['右键', '点击'], desc: '上下文菜单 — 单位详情 / 跟随 / 治疗 / 传送 / 抹除；空地信息与镜头缩放（需指挥模式）', group: '指挥模式', inGame: true },
  { id: 'interact.boxselect', keys: ['Shift', '拖动'], desc: '框选单位 — 松开后选中框内全部存活生物（≤200），底部出现群组操作条（需指挥模式；触屏观察工具拖动同效）', group: '指挥模式', inGame: true },
  { id: 'interact.mark.save', keys: ['Shift', '1-9'], desc: '保存镜头书签（位置 + 缩放，跨会话记忆；需指挥模式）', group: '指挥模式', inGame: true },
  { id: 'interact.mark.jump', keys: ['Alt', '1-9'], desc: '平滑飞回镜头书签（约 400ms 飞行动画；需指挥模式）', group: '指挥模式', inGame: true },
  { id: 'interact.undo', keys: ['Ctrl', 'Z'], desc: '撤销上一次神力 / 地形笔刷操作（简洁模式同样可用：工具误施的安全网）', group: '指挥模式', inGame: true },
  { id: 'interact.redo', keys: ['Ctrl', 'Shift', 'Z'], desc: '重做（等效 Ctrl + Y）', group: '指挥模式', inGame: true },
  { id: 'interact.redo.alt', keys: ['Ctrl', 'Y'], desc: '重做（等效 Ctrl + Shift + Z）', group: '指挥模式', inGame: true },

  // ---------------- 触屏手势（含 2.0 调整；标 75 者需指挥模式） ----------------
  { id: 'touch.tap', keys: ['单指', '点击'], desc: '触屏：使用工具，拖动连续施放（查看工具下拖动 = 平移）', group: '触屏手势' },
  { id: 'touch.longpress', keys: ['长按'], desc: '触屏：空地神之视界 / 生灵上下文菜单（需指挥模式）', group: '触屏手势' },
  { id: 'touch.pinch', keys: ['双指'], desc: '触屏：捏合缩放 + 双指平移', group: '触屏手势' },
  { id: 'touch.dbltap', keys: ['双击'], desc: '触屏：就地放大 1.8 倍', group: '触屏手势' },
];

/** 全量键位（顺序即注册顺序） */
export function getKeymap(): KeymapEntry[] {
  return ENTRIES;
}

/** 按分组聚合（分组顺序固定；组内保持注册顺序）——速查浮层与法典快捷键页共用 */
export function getKeymapByGroup(): { group: KeymapGroup; items: KeymapEntry[] }[] {
  return KEYMAP_GROUP_ORDER.map((group) => ({
    group,
    items: ENTRIES.filter((e) => e.group === group),
  }));
}
