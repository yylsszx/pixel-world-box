'use client';
// ============ 画布上下文菜单（右键 / 触屏长按，Task 45-b） ============
// 上下文感知（菜单项按落点实况动态生成，全部走引擎既有公开 API）：
//   · 落在单位上：查看详情 / 跟随 / 治疗此单位 /（有群组时）传送群组到此 / 抹除
//   · 落在领土上：追加「查看王国」
//   · 空地：此处信息（地形·坐标）/（有群组时）传送群组到此 / 缩放到此（平滑飞行）
import { useEffect, useRef } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { RACES } from '@/lib/game/types';
import { beginStroke, endStroke } from '@/lib/ui/undo';
import { flyTo } from '@/lib/ui/camera';
import type { Unit } from '@/lib/game/types';
import type { LucideIcon } from 'lucide-react';
import { Eye, Crosshair, Heart, LocateFixed, Skull, Info, Crown, ZoomIn } from 'lucide-react';

const TERRAIN_NAMES: string[] = ['深海', '浅海', '沙滩', '草地', '森林', '丘陵', '山地', '雪原', '岩浆', '焦土', '冰面'];

interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  run: () => void;
}

/** 菜单项数据推导（引擎只读查询：hitUnit / terrain / owner / civs） */
function buildItems(wx: number, wy: number): { items: MenuItem[]; header: string | null } {
  const engine = getEngine();
  const st = useGameStore.getState();
  const items: MenuItem[] = [];
  let header: string | null = null;

  const inWorld = wx >= 0 && wy >= 0 && wx < 256 && wy < 160;
  const ti = inWorld ? Math.floor(wy) * 256 + Math.floor(wx) : -1;
  const u: Unit | null = inWorld ? engine.hitUnit(wx, wy, 1.6) : null;

  if (u) {
    header = `${u.name} · ${RACES[u.race]?.name ?? '?'}`;
    items.push({
      id: 'inspect',
      label: '查看详情',
      icon: Eye,
      run: () => st.select(u.id, null),
    });
    items.push({
      id: 'follow',
      label: '跟随',
      icon: Crosshair,
      run: () => {
        st.select(u.id, null);
        // 选中后立即开启跟随（select 会复位 follow，故在下一拍置位）
        requestAnimationFrame(() => useGameStore.getState().toggleFollow());
      },
    });
    items.push({
      id: 'heal',
      label: '治疗此单位',
      icon: Heart,
      run: () => {
        if (engine.devHealUnit(u.id)) st.showInteractNote(`${u.name} 已恢复`, 'good');
      },
    });
    if (st.groupSel.length > 0 && st.groupSel.length <= 60) {
      items.push({
        id: 'grouptele',
        label: `传送群组到此（${st.groupSel.length}）`,
        icon: LocateFixed,
        run: () => {
          let done = 0;
          const ids = st.groupSel;
          for (let k = 0; k < ids.length; k++) {
            const ang = (k / Math.max(1, ids.length)) * Math.PI * 2;
            const rr = ids.length > 1 ? 0.6 + (k % 3) * 0.7 : 0;
            if (engine.devTeleportUnit(ids[k], wx + Math.cos(ang) * rr, wy + Math.sin(ang) * rr)) done++;
          }
          st.showInteractNote(`已传送 ${done} 个单位`, 'good');
        },
      });
    }
    items.push({
      id: 'erase',
      label: '抹除',
      icon: Skull,
      danger: true,
      run: () => {
        // 撤销快照：同步包裹 killUnit → Ctrl+Z 可复活（未及引擎清扫前）
        beginStroke();
        engine.killUnit(u.id);
        endStroke('抹除单位', true);
        st.showInteractNote(`已抹除 ${u.name}`, 'danger');
      },
    });
  } else if (inWorld) {
    header = `${TERRAIN_NAMES[engine.terrain[ti]] ?? '未知'} · (${Math.floor(wx)},${Math.floor(wy)})`;
    const ownerCiv = engine.owner[ti] >= 0 ? engine.civs[engine.owner[ti]] : null;
    if (ownerCiv?.alive) {
      items.push({
        id: 'civ',
        label: `查看王国 · ${ownerCiv.name}`,
        icon: Crown,
        run: () => st.selectCiv(ownerCiv.id),
      });
    }
    if (st.groupSel.length > 0) {
      items.push({
        id: 'grouptele',
        label: `传送群组到此（${st.groupSel.length}）`,
        icon: LocateFixed,
        run: () => {
          let done = 0;
          const ids = st.groupSel;
          for (let k = 0; k < ids.length; k++) {
            const ang = (k / Math.max(1, ids.length)) * Math.PI * 2;
            const rr = ids.length > 1 ? 0.6 + (k % 3) * 0.7 : 0;
            if (engine.devTeleportUnit(ids[k], wx + Math.cos(ang) * rr, wy + Math.sin(ang) * rr)) done++;
          }
          st.showInteractNote(`已传送 ${done} 个单位`, 'good');
        },
      });
    }
    items.push({
      id: 'zoomhere',
      label: '缩放到此',
      icon: ZoomIn,
      run: () => flyTo({ x: wx, y: wy, zoom: Math.max(8, getEngine().cam.zoom) }, 400),
    });
    items.push({
      id: 'info',
      label: '此处信息',
      icon: Info,
      run: () => {
        const parts = [header as string];
        if (ownerCiv?.alive) parts.push(`领土 · ${ownerCiv.name}`);
        if (engine.fire[ti] > 0) parts.push('燃烧中');
        if (engine.radiate[ti] > 0) parts.push('辐射');
        st.showInteractNote(parts.join(' · '), 'info');
      },
    });
  } else {
    header = `界外 · (${Math.floor(wx)},${Math.floor(wy)})`;
    items.push({
      id: 'zoomhere',
      label: '缩放到此',
      icon: ZoomIn,
      run: () => flyTo({ x: Math.max(0, Math.min(255.5, wx)), y: Math.max(0, Math.min(159.5, wy)), zoom: 6 }, 400),
    });
  }
  return { items, header };
}

export function ContextMenu() {
  const ctxMenu = useGameStore((s) => s.ctxMenu);
  const closeCtxMenu = useGameStore((s) => s.closeCtxMenu);
  // 【75 门控】简洁模式不可能有上下文菜单（store 拦截开值 + 关闭时清空），防御性双保险
  const commandMode = useGameStore((s) => s.commandMode);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击菜单外 / Esc（全局链兜底）关闭；画布上的点击交给 GameCanvas 处理（会吞掉该次点击防误施放工具）
  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-wb-main-canvas]')) return; // 画布自理
      if (menuRef.current && !menuRef.current.contains(target)) closeCtxMenu();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [ctxMenu, closeCtxMenu]);

  if (!commandMode || !ctxMenu) return null;
  // 菜单项随渲染实况推导（群组/世界状态变化时自然更新）
  const { items, header } = buildItems(ctxMenu.wx, ctxMenu.wy);

  // 视口边缘自适应：菜单不溢出 390px 小屏
  const W = 208; // 估算宽度（w-52）
  const H = 44 * items.length + (header ? 30 : 8) + 8;
  const left = Math.min(ctxMenu.x, window.innerWidth - W - 6);
  const top = Math.min(ctxMenu.y, window.innerHeight - H - 6);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="画布上下文菜单"
      className="fixed z-[65] w-52 overflow-hidden rounded-sm border-2 border-zinc-700 bg-zinc-950/97 shadow-[0_5px_0_rgba(0,0,0,0.65)]"
      style={{ left: Math.max(4, left), top: Math.max(4, top) }}
    >
      {header && (
        <p className="truncate border-b-2 border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 font-mono text-[11px] font-bold text-amber-200">
          {header}
        </p>
      )}
      <ul className="p-1">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeCtxMenu();
                it.run();
              }}
              className={`flex h-11 w-full items-center gap-2 px-2 text-left text-[12px] font-bold transition-colors ${
                it.danger ? 'text-red-300 hover:bg-red-500/15' : 'text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              <it.icon className={`h-4 w-4 shrink-0 ${it.danger ? 'text-red-400' : 'text-amber-300'}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
