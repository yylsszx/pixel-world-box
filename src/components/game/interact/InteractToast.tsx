'use client';
// ============ 交互 2.0 屏幕级轻提示（撤销 / 镜头书签 / 群组操作反馈） ============
// 顶部居中小胶囊，2.6s 自动消散；仅用户主动操作时出现（不占用主界面常驻空间）。
// 与既有面板内 InlineNote 分工：本组件负责「画布层交互」的即时反馈。
import { useGameStore } from '@/store/gameStore';
import { AnimatePresence, motion } from 'framer-motion';

const toneStyles: Record<string, string> = {
  info: 'border-zinc-600 text-zinc-200',
  good: 'border-amber-400 text-amber-200',
  danger: 'border-orange-500 text-orange-300',
};

export function InteractToast() {
  const interactNote = useGameStore((s) => s.interactNote);
  return (
    <div className="pointer-events-none absolute bottom-[230px] left-1/2 z-40 flex -translate-x-1/2 flex-col items-center sm:bottom-auto sm:top-[66px]">
      <AnimatePresence>
        {interactNote && (
          <motion.div
            key={interactNote.id}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            role="status"
            className={`rounded-sm border-2 bg-zinc-900/95 px-3 py-1 text-[11px] font-bold tracking-wide shadow-[0_3px_0_rgba(0,0,0,0.6)] ${toneStyles[interactNote.tone] ?? toneStyles.info}`}
          >
            {interactNote.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
