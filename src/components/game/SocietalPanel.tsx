'use client';
// ============ Societal Panel: 社会涌现（桌面左侧栏 + 移动端底部抽屉） ============
// 涌现社会内核三系统全景仪表：恐慌传染场（目睹死亡 → 同族传染 → 雪崩溃逃）/
// 血仇网络（记仇 → 复仇优先索敌 → 文明世仇聚合）/ 家族谱系（词法姓氏 · 血脉代际传承）
// 数据源：engine.societalInfo() 1s 轮询快照（恐慌/血仇是瞬态流，家族是长程谱系）
import { useEffect, useState } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Network, X, Users, HeartCrack, Crown, Swords } from 'lucide-react';

/** 引擎 societalInfo() 快照（1s 轮询） */
interface SocietalSnapshot {
  year: number;
  /** panic ≥ 0.5 的单位数 */
  panicNow: number;
  /** panic ≥ 0.72 溃逃中 */
  panicHigh: number;
  /** 历史雪崩规模峰值 */
  panicPeak: number;
  /** 雪崩事件次数 */
  panicEvents: number;
  /** 活跃血仇条数 */
  grudgeActive: number;
  /** 文明世仇 top3（仇恨总分） */
  feuds: { a: number; b: number; aName: string; bName: string; v: number }[];
  /** 家族总数 */
  familyCount: number;
  /** 有姓单位数 */
  famUnits: number;
  /** 最大家族代数 */
  maxGen: number;
  /** top8 家族 */
  families: { id: number; name: string; race: number; raceName: string; founded: number; founder: string; members: number; heroes: number; kills: number; peak: number }[];
}

const EMPTY: SocietalSnapshot = {
  year: 0, panicNow: 0, panicHigh: 0, panicPeak: 0, panicEvents: 0,
  grudgeActive: 0, feuds: [], familyCount: 0, famUnits: 0, maxGen: 0, families: [],
};

/** 小节标题（图标 + 名称，颜色与 Chronicle 事件分类一致；底部分割线强化模块层级） */
function SectionTitle({ icon: Icon, label, tone }: { icon: typeof Users; label: string; tone: string }) {
  return (
    <p className={`flex items-center gap-1 border-b border-zinc-700/60 pb-1 text-[9px] font-bold uppercase tracking-widest ${tone}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </p>
  );
}

function SocBody() {
  const [snap, setSnap] = useState<SocietalSnapshot>(EMPTY);

  useEffect(() => {
    const pull = () => {
      try {
        const g = getEngine().societalInfo();
        if (g) setSnap(g);
      } catch { /* 引擎未就绪 */ }
    };
    pull();
    const t = window.setInterval(pull, 1000);
    return () => window.clearInterval(t);
  }, []);

  // 空态：恐慌无峰值 + 血仇无记录 + 家族未开宗（世界初期三系统均未激活）
  const isEmpty = snap.panicPeak === 0 && snap.grudgeActive === 0 && snap.familyCount === 0;

  if (isEmpty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
          <Network className="h-5 w-5 text-zinc-600" aria-hidden />
        </span>
        <p className="text-center text-[10px] leading-relaxed text-zinc-400">
          放些生物让它们厮杀——<br />
          <span className="text-zinc-500">恐慌、血仇与家族将从废墟中涌现</span>
        </p>
        <p className="text-center font-mono text-[8px] text-zinc-600">{snap.year} 年 · 微观规则静待激活</p>
      </div>
    );
  }

  return (
    <div className="game-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      {/* —— 区块一：恐慌传染场（amber）—— */}
      <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
        <SectionTitle icon={Users} label="恐慌传染场" tone="text-amber-300" />
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          {([
            ['恐慌中', snap.panicNow, '当前恐慌值 ≥ 50% 的单位'],
            ['溃逃中', snap.panicHigh, '恐慌 ≥ 72% 突破阈值、正在夺路狂奔'],
            ['历史峰值', snap.panicPeak, '同时恐慌 ≥ 60% 的历史最大规模'],
            ['雪崩次数', snap.panicEvents, '兽群恐慌雪崩（≥12 只）累计爆发次数'],
          ] as [string, number, string][]).map(([label, v, tip]) => (
            <div key={label} title={tip} className="flex flex-col items-center gap-0.5 rounded-sm border border-amber-900/40 bg-amber-950/10 px-0.5 py-1.5">
              <span className="font-mono text-[13px] font-bold leading-none tabular-nums text-amber-300">{v}</span>
              <span className="text-[8px] font-medium leading-none text-zinc-400">{label}</span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-600">目睹死亡的恐惧在同族间传染，突破阈值即溃逃</p>
      </div>

      {/* —— 区块二：血仇网络（rose）—— */}
      <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
        <SectionTitle icon={HeartCrack} label="血仇网络" tone="text-rose-300" />
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="font-mono text-lg font-black leading-none text-rose-300">{snap.grudgeActive}</span>
          <span className="text-[9px] font-bold text-zinc-500">条活跃血仇</span>
          {snap.feuds.length > 0 && <span className="ml-auto font-mono text-[8px] text-zinc-600">{snap.year} 年</span>}
        </div>
        {snap.feuds.length > 0 ? (
          <ul className="mt-1.5 grid gap-1">
            {snap.feuds.map((f) => (
              <li key={`${f.a}-${f.b}`} className="flex items-center gap-1 rounded-sm bg-zinc-900/70 px-1.5 py-1" title={`文明世仇 · 仇恨总分 ${f.v}`}>
                <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-300">{f.aName}</span>
                <span className="shrink-0 text-[9px] font-bold text-rose-400/80" aria-hidden>⇄</span>
                <span className="min-w-0 flex-1 truncate text-right text-[10px] text-zinc-300">{f.bName}</span>
                <span className="shrink-0 rounded-sm bg-rose-500/15 px-1 font-mono text-[9px] font-bold text-rose-300">{f.v}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-1.5 flex flex-col items-center gap-1.5 rounded-sm border border-dashed border-zinc-800 px-2 py-3">
            <Swords className="h-6 w-6 text-zinc-700" aria-hidden />
            <p className="text-center text-[9px] leading-relaxed text-zinc-500">
              尚无文明级世仇——<br />
              <span className="text-zinc-600">战火与杀戮会让两国结下血海深仇</span>
            </p>
          </div>
        )}
        <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-600">复仇者舍近求远扑向仇敌</p>
      </div>

      {/* —— 区块三：家族谱系（violet）—— */}
      <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
        <SectionTitle icon={Crown} label="家族谱系" tone="text-violet-300" />
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {([
            ['家族', `${snap.familyCount}`, '支'],
            ['有姓', `${snap.famUnits}`, '口'],
            ['最长', `${snap.maxGen}`, '代'],
          ] as [string, string, string][]).map(([label, v, unit]) => (
            <div key={label} className="flex flex-col items-center gap-0.5 rounded-sm bg-zinc-900/70 px-0.5 py-1.5">
              <span className="font-mono text-[13px] font-bold leading-none text-violet-300">
                {v}<span className="ml-0.5 text-[8px] font-normal text-zinc-500">{unit}</span>
              </span>
              <span className="text-[8px] leading-none text-zinc-500">{label}</span>
            </div>
          ))}
        </div>
        {snap.families.length > 0 ? (
          <div className="mt-1.5">
            {/* 列头：与数据行同栅格对齐 */}
            <div className="flex items-center gap-1 px-0.5 pb-0.5 text-[8px] font-bold text-zinc-600">
              <span className="w-3 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">姓氏 · 望族榜</span>
              <span className="w-4 shrink-0 text-right" title="现存成员">口</span>
              <span className="w-5 shrink-0 text-right" title="累计击杀">杀</span>
              <span className="w-4 shrink-0 text-right" title="英雄（十杀者）">雄</span>
            </div>
            <ul className="game-scroll max-h-56 space-y-px overflow-y-auto pr-0.5">
              {snap.families.map((f, i) => (
                <li key={f.id} className={`flex items-center gap-1 rounded-sm px-0.5 py-1 hover:bg-zinc-800/60 ${i % 2 === 1 ? 'bg-zinc-900/50' : ''}`} title={`${f.raceName} · ${f.founded} 年 ${f.founder} 开宗 · 峰值 ${f.peak} 口`}>
                  <span className="w-3 shrink-0 text-right font-mono text-[9px] leading-none tabular-nums text-zinc-600">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-bold leading-tight text-violet-300">{f.name}</p>
                    <p className="truncate text-[8px] leading-tight text-zinc-500">{f.raceName}</p>
                  </div>
                  <span className="w-4 shrink-0 text-right font-mono text-[10px] leading-none tabular-nums text-zinc-300">{f.members}</span>
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] leading-none tabular-nums text-zinc-400">{f.kills}</span>
                  <span className="w-4 shrink-0 text-right font-mono text-[10px] leading-none tabular-nums text-amber-300">{f.heroes}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-col items-center gap-2 rounded-sm border border-dashed border-zinc-800 px-2 py-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
              <Crown className="h-5 w-5 text-zinc-700" aria-hidden />
            </span>
            <p className="text-center text-[10px] leading-relaxed text-zinc-500">
              血脉尚未开宗立姓——放置智慧生物任其繁衍，<br />
              <span className="text-zinc-600">数代之后便有家族在望族榜留名</span>
            </p>
          </div>
        )}
        <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-600">血脉代代相传，十杀者光耀门楣</p>
      </div>

      {/* 脚注 */}
      <p className="border-t border-zinc-800 pt-1.5 text-[9px] leading-relaxed text-zinc-600">
        三条微观规则互相耦合：目睹死亡令恐慌上涌并记下血仇，恐惧在兽群中传染成雪崩，惊魂的种群连繁衍都会停滞；
        而仇恨会压倒恐惧驱使复仇者反扑。岁月化开仇怨（约二十余年），血脉与姓氏则代代长存。
      </p>
    </div>
  );
}

export function SocietalPanel() {
  const { showSocietal, toggleSocietal, mobilePanel, openMobilePanel } = useGameStore();
  return (
    <>
      {/* 桌面左侧栏 */}
      {showSocietal && (
        <div className="su-dock-panel w-72 flex-col">
          <div className="flex items-center justify-between gap-1 border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
                <Network className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />
                社会涌现
              </span>
              <p className="pl-5 text-[8px] tracking-widest text-zinc-500">微观规则 · 宏观秩序</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSocietal}
              aria-label="关闭社会涌现面板"
              className="h-6 w-6 shrink-0 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex max-h-[calc(100dvh-96px-43px)] min-h-[260px] flex-col border-2 border-zinc-700/90 bg-zinc-900/95">
            <SocBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'societal'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="flex h-[58vh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <Network className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
              社会涌现
              <span className="ml-1 text-[9px] font-normal tracking-widest text-zinc-500">微观规则 · 宏观秩序</span>
            </SheetTitle>
          </SheetHeader>
          <SocBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
