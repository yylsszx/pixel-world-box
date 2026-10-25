'use client';
// ============ 面板内联提示条（替代原主界面浮层消息：仅在面板/对话框内部显示操作反馈） ============
import { useGameStore } from '@/store/gameStore';
import { AnimatePresence, motion } from 'framer-motion';

const toneStyles: Record<string, string> = {
  info: 'border-zinc-600 text-zinc-200',
  war: 'border-red-500 text-red-300',
  peace: 'border-emerald-500 text-emerald-300',
  danger: 'border-orange-500 text-orange-300',
  good: 'border-amber-400 text-amber-200',
};

/**
 * 面板内联提示：读取 store.uiNote，渲染在面板/对话框内容区顶部。
 * 主画面保持纯净 — 事件流统一走纪事面板。
 */
export function InlineNote() {
  const uiNote = useGameStore((s) => s.uiNote);
  return (
    <AnimatePresence>
      {uiNote && (
        <motion.div
          key={uiNote.id}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          role="status"
          className={`mb-2 rounded-sm border-2 bg-zinc-900/95 px-3 py-1.5 text-[11px] font-bold tracking-wide shadow-[0_2px_0_rgba(0,0,0,0.5)] ${toneStyles[uiNote.tone] ?? toneStyles.info}`}
        >
          {uiNote.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
