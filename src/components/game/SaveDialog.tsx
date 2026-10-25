'use client';
// ============ Save slot dialog: 3 手动槽 + 自动槽 + 旧版兼容槽 + 文件导出导入 ============
import { useRef } from 'react';
import { useGameStore, type SlotKey } from '@/store/gameStore';
import type { SaveSlotMeta } from '@/lib/game/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InlineNote } from './InlineNote';
import { Save, FolderOpen, Trash2, Clock, Users, Crown, Sparkles, History, ShieldAlert, Download, Upload } from 'lucide-react';

const MANUAL_SLOTS: SlotKey[] = ['slot0', 'slot1', 'slot2'];

function formatTime(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

/** 槽位卡片：保存模式显示「保存/覆盖」，读取模式显示「读取/删除」 */
function SlotCard({
  slotKey,
  index,
  meta,
  mode,
  onSave,
  onLoad,
  onDelete,
}: {
  slotKey: SlotKey;
  index: number;
  meta?: SaveSlotMeta;
  mode: 'save' | 'load';
  onSave: (k: SlotKey) => void;
  onLoad: (k: SlotKey) => void;
  onDelete: (k: SlotKey) => void;
}) {
  const empty = !meta;
  const isSave = mode === 'save';
  return (
    <div
      className={`flex items-center gap-3 rounded-sm border-2 px-3 py-2.5 ${
        empty ? 'border-zinc-800 bg-zinc-900/60' : 'border-zinc-700 bg-zinc-800/70'
      }`}
    >
      {/* 槽位编号 */}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 font-mono text-sm font-black ${
          empty ? 'border-zinc-700 bg-zinc-900 text-zinc-600' : 'border-amber-500/70 bg-zinc-900 text-amber-300'
        }`}
        aria-hidden
      >
        {index}
      </span>
      {/* 槽位信息 */}
      <div className="min-w-0 flex-1">
        {empty ? (
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-zinc-600">— 空槽位 —</p>
            <p className="mt-0.5 text-[9px] text-zinc-700">在此铭刻你的世界</p>
          </div>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-bold text-zinc-200">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-amber-300" aria-hidden />
                纪元 {meta.year} 年
              </span>
              <span className="flex items-center gap-1 text-zinc-400">
                <Users className="h-3 w-3" aria-hidden />
                {meta.pop}
              </span>
              <span className="flex items-center gap-1 text-zinc-400">
                <Crown className="h-3 w-3" aria-hidden />
                {meta.civs}
              </span>
            </p>
            <p className="mt-0.5 font-mono text-[9px] text-zinc-500">
              {formatTime(meta.savedAt)} 保存 · #{meta.seed}
              {isSave && <span className="ml-1 text-amber-400/90">（将被覆盖）</span>}
            </p>
          </>
        )}
      </div>
      {/* 操作 */}
      <div className="flex shrink-0 items-center gap-1.5">
        {isSave ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSave(slotKey)}
            aria-label={`保存到槽位 ${index}`}
            className="h-7 gap-1 rounded-sm border-2 border-zinc-600 bg-zinc-900 px-2 text-[10px] font-bold text-amber-200 hover:bg-amber-500/15 hover:text-amber-100"
          >
            <Save className="h-3 w-3" aria-hidden />
            {empty ? '保存' : '覆盖'}
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={empty}
              onClick={() => onLoad(slotKey)}
              aria-label={`读取槽位 ${index}`}
              className="h-7 gap-1 rounded-sm border-2 border-zinc-600 bg-zinc-900 px-2 text-[10px] font-bold text-teal-200 enabled:hover:bg-teal-500/15 disabled:opacity-40"
            >
              <FolderOpen className="h-3 w-3" aria-hidden />
              读取
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={empty}
              onClick={() => onDelete(slotKey)}
              aria-label={`删除槽位 ${index}`}
              className="h-7 gap-1 rounded-sm border-2 border-zinc-600 bg-zinc-900 px-2 text-[10px] font-bold text-red-300 enabled:hover:bg-red-500/15 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** 特殊槽（自动存档 / 旧版存档）：只在读取模式出现 */
function SpecialSlot({
  meta,
  kind,
  onLoad,
  onDelete,
}: {
  meta: SaveSlotMeta;
  kind: 'auto' | 'legacy';
  onLoad: (k: SlotKey) => void;
  onDelete: (k: SlotKey) => void;
}) {
  const isAuto = kind === 'auto';
  return (
    <div className={`flex items-center gap-3 rounded-sm border-2 px-3 py-2.5 ${isAuto ? 'border-teal-700/80 bg-teal-900/25' : 'border-zinc-700 bg-zinc-800/70'}`}>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 ${isAuto ? 'border-teal-500/70 bg-zinc-900 text-teal-300' : 'border-zinc-500/70 bg-zinc-900 text-zinc-400'}`}
        aria-hidden
      >
        {isAuto ? <Sparkles className="h-4 w-4" aria-hidden /> : <History className="h-4 w-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-bold text-zinc-200">
          <span className={isAuto ? 'text-teal-200' : 'text-zinc-300'}>{isAuto ? '自动存档' : '旧版存档'}</span>
          <span className="flex items-center gap-1 text-zinc-400">
            <Clock className="h-3 w-3" aria-hidden />
            {meta.year} 年
          </span>
          <span className="flex items-center gap-1 text-zinc-400">
            <Users className="h-3 w-3" aria-hidden />
            {meta.pop}
          </span>
        </p>
        <p className="mt-0.5 font-mono text-[9px] text-zinc-500">
          {formatTime(meta.savedAt)}
          {isAuto ? ' · 每 60 秒滚动更新' : ' · 单槽时期的存档'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLoad(kind)}
          aria-label={isAuto ? '读取自动存档' : '读取旧版存档'}
          className="h-7 gap-1 rounded-sm border-2 border-zinc-600 bg-zinc-900 px-2 text-[10px] font-bold text-teal-200 hover:bg-teal-500/15"
        >
          <FolderOpen className="h-3 w-3" aria-hidden />
          读取
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(kind)}
          aria-label={isAuto ? '删除自动存档' : '删除旧版存档'}
          className="h-7 gap-1 rounded-sm border-2 border-zinc-600 bg-zinc-900 px-2 text-[10px] font-bold text-red-300 hover:bg-red-500/15"
        >
          <Trash2 className="h-3 w-3" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function SaveDialog() {
  const { saveDialog, closeSaveDialog, slotMetas, saveToSlot, loadFromSlot, deleteSaveSlot, stats, exportSave, importSave } = useGameStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const open = saveDialog !== 'none';
  const isSave = saveDialog === 'save';
  const metaOf = (k: SlotKey) => slotMetas.find((m) => m.key === k);
  const autoMeta = metaOf('auto');
  const legacyMeta = metaOf('legacy');

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await importSave(file);
    e.target.value = ''; // 允许重复导入同名文件
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeSaveDialog(); }}>
      <DialogContent className="flex max-h-[85dvh] max-w-md flex-col rounded-sm border-2 border-zinc-700 bg-zinc-900/95 p-4 shadow-[0_6px_0_rgba(0,0,0,0.6)]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-black uppercase tracking-widest text-amber-300">
            {isSave ? <Save className="h-4 w-4" aria-hidden /> : <FolderOpen className="h-4 w-4" aria-hidden />}
            {isSave ? '保存世界' : '读取存档'}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            {isSave
              ? `当前世界：纪元 ${stats?.year ?? 0} 年 · ${stats?.totalPop ?? 0} 智慧生物 · ${stats?.civs.length ?? 0} 个王国。选择一个槽位保存。`
              : '选择要读取的存档槽位；自动存档与旧版存档也可以读取。'}
          </DialogDescription>
        </DialogHeader>

        <InlineNote />

        <div className="game-scroll grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1">
          {MANUAL_SLOTS.map((k, i) => (
            <SlotCard
              key={k}
              slotKey={k}
              index={i + 1}
              meta={metaOf(k)}
              mode={isSave ? 'save' : 'load'}
              onSave={saveToSlot}
              onLoad={loadFromSlot}
              onDelete={deleteSaveSlot}
            />
          ))}

          {/* 读取模式：自动存档 + 旧版存档 */}
          {!isSave && (autoMeta || legacyMeta) && (
            <div className="mt-1 grid gap-2 border-t-2 border-zinc-800 pt-2">
              {autoMeta && <SpecialSlot meta={autoMeta} kind="auto" onLoad={loadFromSlot} onDelete={deleteSaveSlot} />}
              {legacyMeta && <SpecialSlot meta={legacyMeta} kind="legacy" onLoad={loadFromSlot} onDelete={deleteSaveSlot} />}
            </div>
          )}

          {/* 文件导出/导入（跨设备迁移） */}
          <div className="mt-1 flex gap-2 border-t-2 border-zinc-800 pt-2">
            {isSave ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={exportSave}
                className="h-7 flex-1 gap-1.5 rounded-sm border-2 border-zinc-600 bg-zinc-900 text-[10px] font-bold text-sky-200 hover:bg-sky-500/15"
              >
                <Download className="h-3 w-3" aria-hidden />
                导出为文件
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="h-7 flex-1 gap-1.5 rounded-sm border-2 border-zinc-600 bg-zinc-900 text-[10px] font-bold text-sky-200 hover:bg-sky-500/15"
                >
                  <Upload className="h-3 w-3" aria-hidden />
                  从文件导入
                </Button>
                {/* 导入成功后如需留存可再保存到槽位（导入本身不写任何槽） */}
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={onImportFile}
                  className="sr-only"
                  aria-label="选择存档 JSON 文件"
                />
              </>
            )}
          </div>

          <p className="flex items-start gap-1.5 pt-0.5 text-[9px] leading-relaxed text-zinc-600">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            存档保存在浏览器本地（约 500KB/槽）；自动存档写入独立槽位，不会覆盖手动存档。导出文件可跨设备导入。
            清除浏览器数据会丢失本地槽位。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
