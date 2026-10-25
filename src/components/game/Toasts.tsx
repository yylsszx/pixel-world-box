'use client';
// ============ Toast notifications (top-center stack) ============
import { useGameStore } from '@/store/gameStore';
import { AnimatePresence, motion } from 'framer-motion';

const toneStyles: Record<string, string> = {
  info: 'border-zinc-600 text-zinc-200',
  war: 'border-red-500 text-red-300',
  peace: 'border-emerald-500 text-emerald-300',
  danger: 'border-orange-500 text-orange-300',
  good: 'border-amber-400 text-amber-200',
};

export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute left-1/2 top-14 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className={`rounded-sm border-2 bg-zinc-900/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider shadow-[0_3px_0_rgba(0,0,0,0.6)] ${toneStyles[t.tone] ?? toneStyles.info}`}
            role="status"
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
