'use client';
// ============ Full-screen game shell ============
// 摄影模式（cinema）：隐藏全部 UI 只留纯净世界画面 + 右下角半透明退出按钮（快捷键 C / 摄影机按钮进入）
import { GameCanvas } from './GameCanvas';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { WorldCluster } from './WorldCluster';
import { SideDock } from './SideDock';
import { SmartHint } from './SmartHint';
// —— 神谕圣装（Task 70 移动端沉浸式神明 UI）：岁月沙漏 / 神之印记手势盘 / 神界之眼 / 透视气泡 ——
import { TimeCapsule } from './TimeCapsule';
import { DivineDial } from './DivineDial';
import { EyeProvidence } from './EyeProvidence';
import { GazeBubble, UnitBubble } from './DivineGaze';
import { Inspector } from './Inspector';
import { HelpDialog } from './HelpDialog';
import { Chronicle } from './Chronicle';
import { KingdomsPanel } from './KingdomsPanel';
import { CivPanel } from './CivPanel';
import { EcologyPanel } from './EcologyPanel';
import { EvolutionPanel } from './EvolutionPanel';
import { SocietalPanel } from './SocietalPanel';
import { NeuroPanel } from './NeuroPanel';
import { AchievementsPanel } from './AchievementsPanel';
import { NaturePanel } from './NaturePanel';
import { TriggersPanel } from './TriggersPanel';
import { DevPanel } from './DevPanel';
import { WorldWarHud } from './WorldWarHud';
import { OraclePanel } from './OraclePanel';
import { CouncilPanel, CouncilDriver } from './CouncilPanel';
import { CodexPanel } from './CodexPanel';
import { SaveDialog } from './SaveDialog';
import { TitleScreen } from './TitleScreen';
import { Onboarding } from './Onboarding';
import { ErrorBoundary } from './ErrorBoundary';
// —— 交互体系 2.0（Task 45-b）：仅在用户主动唤起时出现的浮层/菜单/芯片 ——
import { CommandPalette } from './interact/CommandPalette';
import { KeymapOverlay } from './interact/KeymapOverlay';
import { ContextMenu } from './interact/ContextMenu';
import { GroupBar } from './interact/GroupBar';
import { HoverChip } from './interact/HoverChip';
import { InteractToast } from './interact/InteractToast';
// 【75 指挥模式总开关】：右缘浮动胶囊，复杂交互（框选/菜单/命令面板…）一键启停
import { CommandModeButton } from './interact/CommandModeButton';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { CameraOff } from 'lucide-react';

/** 摄影模式退出按钮：右下角半透明，不抢画面焦点（触屏/鼠标均可点，尊重安全区） */
function CinemaExit() {
  const toggleCinema = useGameStore((s) => s.toggleCinema);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleCinema}
      aria-label="退出摄影模式"
      title="退出摄影模式（C）"
      className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-50 h-9 gap-1.5 border-2 border-white/15 bg-black/35 px-3 text-[11px] font-bold text-white/70 backdrop-blur-sm transition-colors hover:bg-black/55 hover:text-white"
    >
      <CameraOff className="h-4 w-4" aria-hidden />
      退出摄影
    </Button>
  );
}

export function GameShell() {
  const cinema = useGameStore((s) => s.cinema);
  // 42-c boot 流程：'title' = 标题主菜单（隐藏全部 HUD，世界在背后持续运行）；'game' = 正常游戏
  const boot = useGameStore((s) => s.boot);
  const onboardingDone = useGameStore((s) => s.onboardingDone);
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#131009] text-[#f1e8d6] select-none" aria-label="Pixel World Box 游戏">
      {/* 画布永远在错误边界之外：即使 HUD 层渲染崩溃，世界仍继续模拟（错误只打断界面，不打断存档） */}
      <GameCanvas />
      <ErrorBoundary>
        {cinema ? (
          <CinemaExit />
        ) : boot === 'title' ? (
          <TitleScreen />
        ) : (
          <>
            {/* —— 桌面（≥sm）：OmniBar + 侧边坞 + 工具坞（Task 68/69 超级 UI 保持不变） —— */}
            {/* —— 移动端（<sm）：神明 UI 四件套 —— 岁月沙漏（顶部居中胶囊）/ 神界之眼（右上水晶球）/
                神之印记手势盘（底部）/ 透视气泡（长按空地 + 点选生灵）；TopBar/Toolbar 在组件内 sm:flex 隐藏 —— */}
            <TopBar />
            <TimeCapsule />
            <EyeProvidence />
            <GazeBubble />
            <UnitBubble />
            <WorldWarHud />
            <WorldCluster />
            <Inspector />
            <Chronicle />
            <CivPanel />
            <TriggersPanel />
            {/* —— 一体化侧边坞：导航轨 + 坞内十面板同壳（Task 69） —— */}
            <SideDock>
              <KingdomsPanel />
              <EcologyPanel />
              <EvolutionPanel />
              <SocietalPanel />
              <NeuroPanel />
              <AchievementsPanel />
              <NaturePanel />
              <OraclePanel />
              <CouncilPanel />
              <DevPanel />
            </SideDock>
            {/* 议会驱动心跳：不随面板开合卸载（回读轮询 + 周期召开判定） */}
            <CouncilDriver />
            <Toolbar />
            <DivineDial />
            <HelpDialog />
            <SaveDialog />
            <CodexPanel />
            <SmartHint />
            {/* —— 交互体系 2.0 浮层（Ctrl+K / ? / 右键 / Shift 框选 / 悬停芯片 / 操作反馈） —— */}
            {/* 【75】指挥模式总开关永远可见（简洁/指挥两态的基础控制面） */}
            <CommandModeButton />
            <CommandPalette />
            <KeymapOverlay />
            <ContextMenu />
            <GroupBar />
            <HoverChip />
            <InteractToast />
            {!onboardingDone && <Onboarding />}
          </>
        )}
      </ErrorBoundary>
    </main>
  );
}
