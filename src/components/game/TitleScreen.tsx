'use client';
// ============ 42-c 标题主菜单（门面体验） ============
// 全屏覆盖层，盖在持续运行的真实世界画布上——「活的世界在标题后面呼吸」。
// 主菜单：进入世界 / 重铸新世界（六模板真实预览）/ 继续旅程 / 新手教程。
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CircleHelp, Dices, FolderOpen, Globe, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGameStore, type SlotKey } from '@/store/gameStore';
import { sfx } from '@/lib/game/sfx';
import { WORLD_TEMPLATES } from '@/lib/game/worldTemplates';
import { generateWorld } from '@/lib/game/worldgen';
import { H, TERRAIN_RGB, W } from '@/lib/game/constants';
import { GAME_VERSION } from '@/lib/game/version';

/** 缩略图内部分辨率：世界 256×160 每 2×2 采样一像素 → 128×80（CSS 缩到 96×60，pixelated） */
const PREV_W = W / 2;
const PREV_H = H / 2;

/** 单张模板卡：真实世界生成预览（seed 变化即重绘） */
function TemplateCard({
  name,
  tagline,
  terrain,
  selected,
  onSelect,
}: {
  name: string;
  tagline: string;
  terrain: Uint8Array;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(PREV_W, PREV_H);
    for (let py = 0; py < PREV_H; py++) {
      for (let px = 0; px < PREV_W; px++) {
        const c = TERRAIN_RGB[terrain[py * 2 * W + px * 2]] ?? [0, 0, 0];
        const o = (py * PREV_W + px) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [terrain]);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`世界模板：${name}。${tagline}`}
      className={`flex min-h-[44px] cursor-pointer flex-col items-center gap-1 border-2 p-1.5 transition-transform sm:p-2 ${
        selected
          ? 'scale-[1.04] border-amber-400 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.35),3px_3px_0_rgba(0,0,0,0.5)]'
          : 'border-zinc-700 bg-zinc-900/80 shadow-[3px_3px_0_rgba(0,0,0,0.45)] hover:border-zinc-500'
      }`}
    >
      <canvas
        ref={ref}
        width={PREV_W}
        height={PREV_H}
        aria-hidden
        className="h-[60px] w-24 border border-black/40 bg-[#131009] [image-rendering:pixelated]"
      />
      <span className={`text-xs font-bold ${selected ? 'text-amber-200' : 'text-zinc-200'}`}>{name}</span>
      <span className="text-[10px] leading-tight text-zinc-500">{tagline}</span>
    </button>
  );
}

/** 氛围粒子（固定手绘参数，避免随机数导致的注水抖动）：上浮尘光 + 闪烁星屑 */
const FLOAT_DUST = [
  { left: '8%', bottom: '12%', size: 3, dur: '19s', delay: '0s', color: 'bg-amber-300', po: 0.32, dx: '1.6vw' },
  { left: '22%', bottom: '6%', size: 2, dur: '24s', delay: '-6s', color: 'bg-white', po: 0.24, dx: '-1vw' },
  { left: '35%', bottom: '18%', size: 3, dur: '21s', delay: '-11s', color: 'bg-emerald-400', po: 0.28, dx: '0.8vw' },
  { left: '52%', bottom: '8%', size: 2, dur: '26s', delay: '-3s', color: 'bg-amber-400', po: 0.3, dx: '-1.4vw' },
  { left: '68%', bottom: '14%', size: 3, dur: '18s', delay: '-9s', color: 'bg-amber-300', po: 0.34, dx: '1.2vw' },
  { left: '81%', bottom: '5%', size: 2, dur: '23s', delay: '-15s', color: 'bg-emerald-300', po: 0.22, dx: '-0.8vw' },
  { left: '92%', bottom: '16%', size: 3, dur: '20s', delay: '-5s', color: 'bg-white', po: 0.2, dx: '1vw' },
  { left: '14%', bottom: '30%', size: 2, dur: '25s', delay: '-13s', color: 'bg-amber-200', po: 0.26, dx: '1vw' },
];
const TWINKLE_STARS = [
  { left: '18%', top: '22%', size: 2, dur: '3.2s', delay: '0s', color: 'bg-amber-200' },
  { left: '44%', top: '12%', size: 3, dur: '4.1s', delay: '-1.4s', color: 'bg-white' },
  { left: '63%', top: '28%', size: 2, dur: '3.6s', delay: '-2.2s', color: 'bg-emerald-300' },
  { left: '86%', top: '10%', size: 2, dur: '4.5s', delay: '-0.8s', color: 'bg-amber-300' },
];

export function TitleScreen() {
  const enterWorld = useGameStore((s) => s.enterWorld);
  const forgeWorld = useGameStore((s) => s.forgeWorld);
  const restartOnboarding = useGameStore((s) => s.restartOnboarding);
  const loadFromSlot = useGameStore((s) => s.loadFromSlot);
  const refreshSlots = useGameStore((s) => s.refreshSlots);
  const slotMetas = useGameStore((s) => s.slotMetas);

  const [panel, setPanel] = useState<'menu' | 'forge'>('menu');
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1e9));
  const [tplId, setTplId] = useState('classic');

  // 打开标题屏时刷新一次存档列表（「继续旅程」按钮 + 页脚槽位数）
  useEffect(() => {
    refreshSlots();
  }, [refreshSlots]);

  // 最近存档（savedAt 最新者；无存档 → 不显示「继续旅程」）
  const latestSave = useMemo(
    () => [...slotMetas].sort((a, b) => b.savedAt - a.savedAt)[0] ?? null,
    [slotMetas],
  );

  // 六模板真实预览：seed 变化（掷骰/输入）全部重生成
  const previews = useMemo(() => {
    const map = new Map<string, Uint8Array>();
    for (const t of WORLD_TEMPLATES) map.set(t.id, generateWorld(seed, t.params).terrain);
    return map;
  }, [seed]);

  const selectedTpl = useMemo(() => WORLD_TEMPLATES.find((t) => t.id === tplId) ?? WORLD_TEMPLATES[0], [tplId]);

  const rollSeed = () => {
    sfx.click();
    setSeed(Math.floor(Math.random() * 1e9));
  };

  const onSeedInput = (raw: string) => {
    const v = Math.floor(Number(raw));
    if (raw !== '' && Number.isFinite(v)) setSeed(Math.abs(v) % 1_000_000_000);
  };

  // Esc 从模板面板返回主菜单
  useEffect(() => {
    if (panel !== 'forge') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sfx.click();
        setPanel('menu');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  return (
    <div
      aria-label="像素世界盒子 标题主菜单"
      className="absolute inset-0 z-50 flex translate-y-[2.5vh] flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-[rgba(19,16,9,0.74)] to-[rgba(19,16,9,0.92)] px-4 py-8 backdrop-blur-[6px]"
    >
      {/* 本组件作用域 keyframes：上浮尘光 / 闪烁星屑 / 入场上移 */}
      <style>{`
@keyframes wbFloat { 0% { transform: translate3d(0, 4vh, 0); opacity: 0; } 12%, 82% { opacity: var(--po, 0.3); } 100% { transform: translate3d(var(--px, 1vw), -54vh, 0); opacity: 0; } }
@keyframes wbTwinkle { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.65; } }
@keyframes wbRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes wbBreathe { 0%, 100% { box-shadow: 4px 4px 0 rgba(0,0,0,0.55), 0 0 0 0 rgba(217,163,90,0); } 50% { box-shadow: 4px 4px 0 rgba(0,0,0,0.55), 0 0 16px 3px rgba(217,163,90,0.35); } }
.wb-tpl-scroll { scrollbar-width: thin; scrollbar-color: rgba(113,113,122,0.6) transparent; }
.wb-tpl-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.wb-tpl-scroll::-webkit-scrollbar-thumb { background: rgba(113,113,122,0.6); }
.wb-tpl-scroll::-webkit-scrollbar-track { background: transparent; }
`}</style>

      {/* 氛围粒子层 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {FLOAT_DUST.map((p, i) => (
          <span
            key={`f${i}`}
            className={`absolute animate-[wbFloat_linear_infinite] ${p.color}`}
            style={
              {
                left: p.left,
                bottom: p.bottom,
                width: p.size,
                height: p.size,
                animationDuration: p.dur,
                animationDelay: p.delay,
                '--po': p.po,
                '--px': p.dx,
              } as React.CSSProperties
            }
          />
        ))}
        {TWINKLE_STARS.map((p, i) => (
          <span
            key={`t${i}`}
            className={`absolute animate-[wbTwinkle_ease-in-out_infinite] ${p.color}`}
            style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDuration: p.dur, animationDelay: p.delay }}
          />
        ))}
      </div>

      {/* ---------- Logo 区（逐层淡入上移） ---------- */}
      <div className="relative flex flex-col items-center gap-3 text-center">
        <div
          className="flex h-14 w-14 animate-[wbRise_0.5s_ease-out_backwards] items-center justify-center rounded-[14px] border-2 border-[#c8964a] bg-[#262019]/80 shadow-[4px_4px_0_rgba(0,0,0,0.55)]"
          style={{ animationDelay: '0.05s' }}
        >
          <Globe className="h-8 w-8 text-[#e6ba6c]" aria-hidden />
        </div>
        <h1
          className="animate-[wbRise_0.55s_ease-out_backwards] text-5xl leading-none font-black tracking-wide text-[#e6ba6c] sm:text-6xl lg:text-7xl"
          style={{ textShadow: '3px 3px 0 #131009, 6px 6px 0 rgba(0,0,0,0.45)', animationDelay: '0.15s' }}
        >
          像素世界盒子
        </h1>
        <p
          className="animate-[wbRise_0.55s_ease-out_backwards] text-[10px] font-semibold tracking-[0.4em] text-[#a2957c] sm:text-xs"
          style={{ animationDelay: '0.3s' }}
        >
          PIXEL WORLD BOX · 上帝模拟沙盒 · BRASS OBSERVATORY
        </p>
        <span
          className="animate-[wbRise_0.55s_ease-out_backwards] rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-amber-300/90"
          style={{ animationDelay: '0.4s' }}
        >
          预览版 {GAME_VERSION.replace('-preview', '')}
        </span>
      </div>

      {/* ---------- 主菜单 / 模板面板 ---------- */}
      {panel === 'menu' ? (
        <nav
          aria-label="主菜单"
          className="relative mt-8 flex w-full max-w-xs animate-[wbRise_0.55s_ease-out_backwards] flex-col gap-3 sm:mt-10"
          style={{ animationDelay: '0.5s' }}
        >
          <Button
            onClick={() => enterWorld()}
            className="h-13 gap-2.5 rounded-none border-2 border-amber-300 bg-amber-400 text-base font-black text-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.55)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-amber-300 hover:shadow-[2px_2px_0_rgba(0,0,0,0.55)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none animate-[wbBreathe_3.2s_ease-in-out_infinite]"
          >
            <Globe className="h-5 w-5" aria-hidden />
            进入世界
          </Button>
          <Button
            onClick={() => {
              sfx.click();
              setPanel('forge');
            }}
            className="h-12 gap-2.5 rounded-none border-2 border-zinc-600 bg-zinc-900/80 text-sm font-bold text-zinc-200 shadow-[4px_4px_0_rgba(0,0,0,0.45)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:border-amber-400/70 hover:text-amber-200 hover:shadow-[2px_2px_0_rgba(0,0,0,0.45)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          >
            <Sparkles className="h-5 w-5 text-amber-300" aria-hidden />
            重铸新世界
          </Button>
          {latestSave && (
            <Button
              onClick={() => {
                if (loadFromSlot(latestSave.key as SlotKey)) enterWorld();
              }}
              className="h-12 gap-2.5 rounded-none border-2 border-zinc-600 bg-zinc-900/80 text-sm font-bold text-zinc-200 shadow-[4px_4px_0_rgba(0,0,0,0.45)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:border-amber-400/70 hover:text-amber-200 hover:shadow-[2px_2px_0_rgba(0,0,0,0.45)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
            >
              <FolderOpen className="h-5 w-5 text-amber-300" aria-hidden />
              继续旅程
              <span className="ml-auto font-mono text-[10px] font-normal text-zinc-400">
                第{latestSave.year}年 · 人口{latestSave.pop}
              </span>
            </Button>
          )}
          <Button
            onClick={() => {
              restartOnboarding();
              enterWorld();
            }}
            className="h-12 gap-2.5 rounded-none border-2 border-zinc-600 bg-zinc-900/80 text-sm font-bold text-zinc-200 shadow-[4px_4px_0_rgba(0,0,0,0.45)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:border-amber-400/70 hover:text-amber-200 hover:shadow-[2px_2px_0_rgba(0,0,0,0.45)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          >
            <CircleHelp className="h-5 w-5 text-amber-300" aria-hidden />
            新手教程
          </Button>
        </nav>
      ) : (
        <section
          aria-label="重铸新世界：世界模板选择"
          className="relative mt-6 flex w-full max-w-2xl animate-[wbRise_0.4s_ease-out_backwards] flex-col gap-3"
        >
          {/* 种子行 */}
          <div className="flex items-center gap-2">
            <label htmlFor="wb-seed" className="shrink-0 text-xs font-bold text-zinc-400">
              种子
            </label>
            <Input
              id="wb-seed"
              type="number"
              inputMode="numeric"
              min={0}
              max={999999999}
              value={seed}
              onChange={(e) => onSeedInput(e.target.value)}
              className="h-10 w-32 rounded-none border-2 border-zinc-600 bg-zinc-900/80 font-mono text-sm text-zinc-200 shadow-[3px_3px_0_rgba(0,0,0,0.45)] focus-visible:border-amber-400 focus-visible:ring-0"
            />
            <Button
              onClick={rollSeed}
              aria-label="掷骰：随机新种子"
              title="随机新种子"
              className="h-10 w-10 shrink-0 rounded-none border-2 border-zinc-600 bg-zinc-900/80 shadow-[3px_3px_0_rgba(0,0,0,0.45)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:border-amber-400/70 hover:shadow-[1px_1px_0_rgba(0,0,0,0.45)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              variant="ghost"
            >
              <Dices className="h-5 w-5 text-amber-300" aria-hidden />
            </Button>
            <span className="ml-auto hidden font-mono text-[10px] text-zinc-500 sm:block">
              同一种子 = 同一个世界
            </span>
          </div>

          {/* 六模板卡（移动端纵向滚动） */}
          <div className="wb-tpl-scroll grid max-h-[44dvh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {WORLD_TEMPLATES.map((t) => (
              <TemplateCard
                key={t.id}
                name={t.name}
                tagline={t.tagline}
                terrain={previews.get(t.id)!}
                selected={t.id === tplId}
                onSelect={() => {
                  sfx.click();
                  setTplId(t.id);
                }}
              />
            ))}
          </div>

          {/* 选中模板详情 */}
          <p className="min-h-8 border-l-2 border-amber-500/50 pl-2.5 text-xs leading-relaxed text-zinc-300">
            <span className="font-bold text-amber-200">{selectedTpl.name}</span> —— {selectedTpl.desc}
          </p>

          {/* 行动行 */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                sfx.click();
                setPanel('menu');
              }}
              className="h-11 gap-1.5 rounded-none border-2 border-zinc-600 bg-zinc-900/80 px-3 text-xs font-bold text-zinc-300 shadow-[3px_3px_0_rgba(0,0,0,0.45)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:border-zinc-500 hover:shadow-[1px_1px_0_rgba(0,0,0,0.45)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              返回
            </Button>
            <Button
              onClick={() => forgeWorld(tplId, seed)}
              className="h-12 flex-1 gap-2.5 rounded-none border-2 border-amber-300 bg-amber-400 text-sm font-black text-zinc-950 shadow-[4px_4px_0_rgba(0,0,0,0.55)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-amber-300 hover:shadow-[2px_2px_0_rgba(0,0,0,0.55)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
            >
              <Sparkles className="h-5 w-5" aria-hidden />
              以「{selectedTpl.name}」重铸世界
            </Button>
          </div>
        </section>
      )}

      {/* ---------- 页脚 ---------- */}
      <footer className="relative mt-8 flex flex-col items-center gap-1 text-center font-mono text-[10px] text-zinc-400 sm:mt-10">
        <span>纯前端运行 · 无需安装 · 存档保存在浏览器本地</span>
        <span className="text-zinc-500">
          {slotMetas.length > 0 ? `${slotMetas.length} 个存档槽待续` : '暂无存档 · 每个世界都从零开始'}
        </span>
      </footer>
    </div>
  );
}
