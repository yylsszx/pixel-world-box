'use client';
// ============ 群组操作条（Shift 框选后出现，Task 45-b） ============
// 屏幕底部居中小卡片：数量 / 种族构成 / 平均 HP / 总击杀聚合
// + 操作按钮：跟随（镜头追质心）/ 治疗 / 传送（下一次左键点击处）/ 抹除 / 取消。
// 群组操作全部逐单位调用引擎既有公开 API（devHealUnit / killUnit / devTeleportUnit），
// 数量多时一次循环批量执行 + 完成提示；抹除走撤销快照（Ctrl+Z 可尽力复活）。
import { useEffect, useState } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { RACES } from '@/lib/game/types';
import { beginStroke, endStroke } from '@/lib/ui/undo';
import type { Unit } from '@/lib/game/types';
import type { LucideIcon } from 'lucide-react';
import { Crosshair, Heart, LocateFixed, Skull, X } from 'lucide-react';

interface GroupAgg {
  alive: number;
  races: string[];
  avgHp: number;
  kills: number;
}

function aggregate(ids: number[]): GroupAgg {
  const engine = getEngine();
  let alive = 0;
  let hpSum = 0;
  let kills = 0;
  const byRace = new Map<string, number>();
  for (const id of ids) {
    const u = engine.unitById.get(id) as Unit | undefined;
    if (!u || u.dead) continue;
    alive++;
    hpSum += u.hp;
    kills += u.kills;
    const rn = RACES[u.race]?.name ?? '?';
    byRace.set(rn, (byRace.get(rn) ?? 0) + 1);
  }
  return {
    alive,
    races: [...byRace.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}×${c}`),
    avgHp: alive > 0 ? Math.round(hpSum / alive) : 0,
    kills,
  };
}

function OpButton({
  icon: Icon,
  label,
  danger,
  armed,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  armed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 items-center gap-1 border-2 px-2.5 text-[11px] font-bold tracking-wide transition-colors ${
        armed
          ? 'border-amber-300 bg-amber-400/25 text-amber-200'
          : danger
            ? 'border-zinc-700 bg-zinc-900/95 text-red-300 hover:border-red-400 hover:bg-red-500/10'
            : 'border-zinc-700 bg-zinc-900/95 text-zinc-200 hover:border-amber-400/70 hover:text-amber-200'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function GroupBar() {
  const groupSel = useGameStore((s) => s.groupSel);
  const groupFollow = useGameStore((s) => s.groupFollow);
  const pendingGroupAction = useGameStore((s) => s.pendingGroupAction);
  // 【75 门控】指挥模式关闭时群组必为空（store 清扫 + setGroupSel 拦截），此处防御性双保险
  const commandMode = useGameStore((s) => s.commandMode);
  const [agg, setAgg] = useState<GroupAgg | null>(null);

  // 500ms 低频轮询聚合（战斗中 HP/击杀会变动；单位死亡后计数收缩）
  useEffect(() => {
    if (!commandMode || groupSel.length === 0) {
      setAgg(null);
      return;
    }
    setAgg(aggregate(groupSel));
    const t = window.setInterval(() => setAgg(aggregate(groupSel)), 500);
    return () => window.clearInterval(t);
  }, [groupSel, commandMode]);

  if (!commandMode || groupSel.length === 0) return null;

  const st = useGameStore.getState();
  const engine = getEngine();

  const healAll = () => {
    let done = 0;
    for (const id of groupSel) if (engine.devHealUnit(id)) done++;
    st.showInteractNote(`已治疗 ${done} 个单位`, 'good');
  };
  const eraseAll = () => {
    beginStroke();
    let done = 0;
    for (const id of groupSel) {
      const u = engine.unitById.get(id);
      if (u && !u.dead) {
        engine.killUnit(id); // killUnit 返回 void——存活判定在调用前做
        done++;
      }
    }
    endStroke('抹除群组', true); // Ctrl+Z 可尽力复活（未及引擎清扫前）
    st.showInteractNote(`已抹除 ${done} 个单位`, 'danger');
    st.clearGroupSel();
  };

  return (
    <div className="pointer-events-none absolute bottom-[176px] left-1/2 z-30 flex w-[min(560px,94vw)] -translate-x-1/2 flex-col gap-1">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-sm border-2 border-amber-700/80 bg-zinc-900/95 px-2 py-1.5 shadow-[0_4px_0_rgba(0,0,0,0.6)]">
        <span className="flex h-11 flex-col justify-center border-r-2 border-zinc-800 pr-2">
          <span className="font-mono text-sm font-black text-amber-300">{agg?.alive ?? groupSel.length}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">已选中</span>
        </span>
        <span className="flex h-11 max-w-[10rem] flex-col justify-center gap-0.5 border-r-2 border-zinc-800 pr-2 sm:max-w-[14rem]">
          <span className="truncate text-[10px] font-bold text-zinc-300">{agg?.races.slice(0, 3).join(' · ') ?? '—'}</span>
          <span className="truncate font-mono text-[9px] text-zinc-500">
            均 HP {agg?.avgHp ?? 0} · 击杀 {agg?.kills ?? 0}
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <OpButton
            icon={Crosshair}
            label={groupFollow ? '停止跟随' : '跟随'}
            armed={groupFollow}
            onClick={() => st.setGroupFollow(!groupFollow)}
          />
          <OpButton icon={Heart} label="治疗" onClick={healAll} />
          <OpButton
            icon={LocateFixed}
            label="传送"
            armed={pendingGroupAction === 'teleport'}
            onClick={() => {
              const next = pendingGroupAction === 'teleport' ? null : 'teleport';
              st.setPendingGroupAction(next);
              if (next) st.showInteractNote('点击地图选择传送落点（Esc 取消）', 'info');
            }}
          />
          <OpButton icon={Skull} label="抹除" danger onClick={eraseAll} />
          <OpButton icon={X} label="取消选择" onClick={() => st.clearGroupSel()} />
        </div>
      </div>
      {pendingGroupAction === 'teleport' && (
        <p className="pointer-events-none self-center rounded-sm border-2 border-amber-400/70 bg-zinc-900/95 px-2 py-0.5 text-[10px] font-bold text-amber-200">
          传送模式：点击地图落位（触屏轻点即可）· Esc 取消
        </p>
      )}
    </div>
  );
}
