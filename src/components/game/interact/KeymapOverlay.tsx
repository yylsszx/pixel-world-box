'use client';
// ============ 键位速查浮层（? 键 / Shift+/，Task 45-b） ============
// 消费 lib/ui/keymap.ts 统一注册表：分组展示全部键位（含既有与交互 2.0 新增）。
// kbd 键帽样式与世界法典（HelpDialog.Kbd）一致：zinc-800 底 + zinc-600 边 + 硬阴影。
// Task 69-b 触屏补齐：新增「触屏手势」图标分区（取代注册表同名简易组，避免重复）；
// 打开入口从纯键盘 ? 扩展为 世界法典（入门页）「完整键位与手势」按钮——触屏可达。
import { useGameStore } from '@/store/gameStore';
import { getKeymapByGroup } from '@/lib/ui/keymap';
import {
  Keyboard, X, Pointer, Timer, ZoomIn, Move, Maximize2, Hourglass, Sparkles, Eye, Gauge,
} from 'lucide-react';

/** kbd 键帽（与 HelpDialog 同款视觉，单一风格事实） */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block shrink-0 rounded-sm border-2 border-zinc-600 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200 shadow-[0_2px_0_rgba(0,0,0,0.5)]">
      {children}
    </span>
  );
}

/** 触屏手势分区（Task 69-b 建立，Task 70 神明 UI 更新）：画布手势 + 神明 UI 入口，与键盘分区并列展示 */
const TOUCH_GESTURES: { icon: typeof Pointer; gesture: string; desc: string }[] = [
  { icon: Pointer, gesture: '单指拖动', desc: '施放当前工具 / 连续绘制（施法中 HUD 自动隐身）' },
  { icon: Timer, gesture: '长按地面', desc: '神之视界：透视地形/领土/火情，松手消散；长按生灵 = 菜单' },
  { icon: ZoomIn, gesture: '双指捏合地图', desc: '缩放世界' },
  { icon: Move, gesture: '双指拖动', desc: '平移镜头' },
  { icon: Maximize2, gesture: '双击', desc: '观察模式下就地放大（约 1.8 倍；施法工具不触发，防误缩放）' },
  { icon: Hourglass, gesture: '捏合岁月沙漏', desc: '无极连调时间流速：随指距连续缩放 0.1–20×，彻底捏拢归暂停' },
  { icon: Gauge, gesture: '长按岁月沙漏', desc: '呼出无极调速盘：打数字 / 滑条 / 预设档；倍速徽标亦可点开' },
  { icon: Sparkles, gesture: '神之印记', desc: '点底部印记或上滑 → 图腾抽屉选工具；点地图即收回' },
  { icon: Eye, gesture: '神界之眼', desc: '右上水晶球 → 全屏俯瞰图：跳转 / 面板 / 搜索 / 速度' },
];

export function KeymapOverlay() {
  const keymapOpen = useGameStore((s) => s.keymapOpen);
  const setKeymapOpen = useGameStore((s) => s.setKeymapOpen);
  if (!keymapOpen) return null;
  // 注册表的「触屏手势」简易组由下方图标版手势区取代（信息更全且不重复计数）
  const groups = getKeymapByGroup().filter((g) => g.group !== '触屏手势');
  const totalCount = groups.reduce((n, g) => n + g.items.length, 0) + TOUCH_GESTURES.length;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(13,11,7,0.55)] backdrop-blur-[6px] p-3"
      role="dialog"
      aria-modal="true"
      aria-label="键位速查"
      onClick={() => setKeymapOpen(false)}
    >
      <div
        className="flex max-h-[70vh] w-[calc(100vw-1.5rem)] flex-col rounded-sm border-2 border-zinc-700 bg-zinc-950/97 shadow-[0_6px_0_rgba(0,0,0,0.6)] sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b-2 border-zinc-800 px-3 py-2">
          <Keyboard className="h-4 w-4 text-amber-300" aria-hidden />
          <span className="text-sm font-black tracking-[0.25em] text-amber-300 [text-shadow:0_2px_0_rgba(0,0,0,0.6)]">键位速查</span>
          <span className="rounded-sm border border-zinc-700 bg-zinc-800/80 px-1 font-mono text-[9px] font-bold text-zinc-500">
            {totalCount} 条
          </span>
          <button
            type="button"
            onClick={() => setKeymapOpen(false)}
            aria-label="关闭键位速查"
            className="ml-auto flex h-9 w-9 items-center justify-center border-2 border-zinc-700 text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-200 sm:h-7 sm:w-7"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <div className="game-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
          {groups.map((g) => (
            <div key={g.group} className="mb-3 last:mb-0">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300/90">
                <span className="inline-block h-1 w-1 bg-amber-400/80" aria-hidden />
                {g.group}
              </p>
              <ul className="grid gap-1">
                {g.items.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 rounded-md border border-[rgba(214,178,120,0.14)] bg-[rgba(19,16,9,0.45)] px-2 py-1.5">
                    <span className="flex min-w-[7.5rem] max-w-[45%] flex-wrap items-center gap-1">
                      {e.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-400">{e.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {/* —— 触屏手势分区（Task 69-b）：图标 + 手势名，行卡与键盘分区同款（Task 72-b 黄铜行卡） —— */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300/90">
              <span className="inline-block h-1 w-1 bg-amber-400/80" aria-hidden />
              触屏手势
            </p>
            <ul className="grid gap-1">
              {TOUCH_GESTURES.map((g) => (
                <li key={g.gesture} className="flex items-center gap-2 rounded-md border border-[rgba(214,178,120,0.14)] bg-[rgba(19,16,9,0.45)] px-2 py-1.5">
                  <span className="flex min-w-[7.5rem] max-w-[45%] flex-wrap items-center gap-1.5">
                    <g.icon className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                    <span className="text-[11px] font-bold text-amber-200">{g.gesture}</span>
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-400">{g.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="shrink-0 border-t-2 border-zinc-800 px-3 py-1.5 text-center text-[10px] text-zinc-600">
          按 <Kbd>Esc</Kbd> 或点击空白处关闭 · 完整说明见世界法典（<Kbd>H</Kbd>）「快捷键」页
        </p>
      </div>
    </div>
  );
}
