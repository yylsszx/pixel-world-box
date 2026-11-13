'use client';
// ============ CivBrainDriver：文明中枢外脑驱动心跳（civ-brain 二笔） ============
// 架构（与议会 CouncilDriver 同型）：不随面板开合卸载的常驻驱动——
//   · 每 2s 心跳：总开关开 → 到期文明（距上次召开 ≥ civBrainEvery 游戏年）逐个召集中枢
//   · 国情摘要来自 engine.getCivInfo（人口/经济/战争/科技/社会一站式），人格六维来自 engine.brainOf
//   · POST /api/civ-brain（provider 随请求体传入——各文明可接不同 API 的机制④在面板层配置，此处用共享配置）
//   · 回传 personaPatch + note → store.applyCivBrain → engine.setCivBrain（clamp 二道闸 + 'brain' 编年史纪事）
//   · 串行召开（一次一国）：外脑再慢也不并发轰炸；失败静默下轮重试（无 note 不播报）
import { useEffect, useRef } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { loadStoredProvider } from '@/lib/oracle/provider-store';

/** 各文明上次召开年份（会话级：读档/新世界自动跟随引擎年份基准） */
const lastHeld = new Map<number, number>();

/** 国情摘要（送入外脑的年度速报——全部取自引擎单一事实源） */
function buildBrief(civId: number): Record<string, unknown> | null {
  const eng = getEngine();
  const info = eng?.getCivInfo(civId) ?? null;
  if (!eng || !info) return null;
  return {
    国名: info.name,
    种族: info.raceName,
    年份: Math.floor(eng.yearF),
    人口: info.pop,
    领土: info.tiles,
    房屋: info.houses,
    国库: Math.round(info.gold),
    知识: Math.round(info.knowledge),
    粮仓: Math.round(info.food),
    常备军: info.army,
    战争中: info.wars.length > 0 ? info.wars : '无',
    稳定度: info.stability,
    文化: info.culture,
    军国主义: info.militarism,
    政体: info.govName,
    科技数: info.techCount,
    在研: info.research ? `${info.research}（${Math.round((info.researchP / Math.max(1, info.researchNeed)) * 100)}%）` : '无',
    建筑: Object.fromEntries(info.builds.map((b) => [b.kind, b.n])),
    收入: info.income,
    支出: info.expense,
  };
}

export function CivBrainDriver() {
  const busy = useRef(false);

  useEffect(() => {
    const iv = window.setInterval(async () => {
      const st = useGameStore.getState();
      if (!st.civBrainOn || busy.current) return;
      const eng = getEngine();
      if (!eng) return;
      // 到期文明（人口 ≥15 才值得召开；一次一国串行）
      const year = Math.floor(eng.yearF);
      const due = eng.civs.find((c) => {
        if (!c.alive || c.pop < 15) return false;
        const last = lastHeld.get(c.id);
        return last == null || year - last >= st.civBrainEvery;
      });
      if (!due) return;
      lastHeld.set(due.id, year); // 无论成败都记召开年（失败下轮再试，不轰炸）
      const provider = loadStoredProvider();
      if (provider.kind === 'local') return; // 本地模型无服务端通道：静默跳过
      const brief = buildBrief(due.id);
      if (!brief) return;
      busy.current = true;
      try {
        const res = await fetch('/api/civ-brain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, civ: brief, persona: eng.brainOf(due) }),
        });
        if (res.ok) {
          const out = (await res.json()) as { personaPatch?: Record<string, number>; note?: string; error?: string };
          if (out.personaPatch && Object.keys(out.personaPatch).length > 0) {
            useGameStore.getState().applyCivBrain(due.id, out.personaPatch, out.note || undefined);
          }
        }
      } catch {
        /* 网络瞬断：静默，下轮自愈 */
      } finally {
        busy.current = false;
      }
    }, 2000);
    // QA 调试口：手动召集中枢 / 查看召开年账本
    (window as unknown as Record<string, unknown>).__wbCivBrain = {
      convene: (civId: number) => { lastHeld.delete(civId); },
      held: () => ({ ...lastHeld }),
    };
    return () => {
      window.clearInterval(iv);
      delete (window as unknown as Record<string, unknown>).__wbCivBrain;
    };
  }, []);

  return null;
}
