'use client';
// ============ 全局错误边界：世界暂时崩坏时的像素风兜底卡 ============
// 捕获 HUD / 面板层渲染错误（GameCanvas 在边界之外继续运行，世界不停止模拟）
// 兜底：全屏 #0d1b2e 暗底 + 居中像素卡；「重新加载」硬刷新 /「回到标题」收起全部面板重启门面
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Bug, RotateCcw, Undo2 } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 留痕：错误对象 + 出错的组件栈（发布后排查的第一手线索）
    console.error('[PixelWorldBox] 世界暂时崩坏了：', error, info.componentStack ?? '');
  }

  private handleBackToTitle = (): void => {
    // showTitle 会收起全部面板/对话框并把 boot 切回 'title'——即使部分 UI 状态已损坏也安全
    try {
      useGameStore.getState().showTitle();
    } catch (e) {
      console.error('[PixelWorldBox] 回到标题失败，请使用重新加载：', e);
    }
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        aria-label="游戏界面发生错误"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0d1b2e]/97 p-4"
      >
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-sm border-2 border-zinc-700 bg-zinc-900/95 p-6 text-center shadow-[0_6px_0_rgba(0,0,0,0.6)]">
          <span className="flex h-14 w-14 items-center justify-center rounded-sm border-2 border-amber-500/70 bg-amber-400/15 shadow-[0_4px_0_rgba(0,0,0,0.5)]">
            <Bug className="h-7 w-7 text-amber-300" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-black tracking-[0.25em] text-amber-300 [text-shadow:0_2px_0_rgba(0,0,0,0.6)]">
              世界暂时崩坏了
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              一处界面错误打断了这次创造。错误已记录到控制台——
              <br />
              你的世界仍保存在存档中（每 60 秒自动保存）。
            </p>
          </div>
          <p
            className="w-full truncate rounded-sm border border-zinc-800 bg-zinc-950/80 px-2 py-1 font-mono text-[10px] text-zinc-500"
            title={error.message}
          >
            {error.message || String(error)}
          </p>
          <div className="mt-1 flex w-full flex-col gap-2">
            <Button
              onClick={() => window.location.reload()}
              className="h-11 rounded-sm border-2 border-amber-500/80 bg-amber-400/20 text-xs font-bold tracking-widest text-amber-200 shadow-[0_4px_0_rgba(0,0,0,0.5)] hover:bg-amber-400/30 active:translate-y-[2px] active:shadow-[0_2px_0_rgba(0,0,0,0.5)]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              重新加载
            </Button>
            <Button
              onClick={this.handleBackToTitle}
              className="h-11 rounded-sm border-2 border-zinc-600 bg-zinc-800/80 text-xs font-bold tracking-widest text-zinc-300 shadow-[0_4px_0_rgba(0,0,0,0.5)] hover:bg-zinc-700/80 active:translate-y-[2px] active:shadow-[0_2px_0_rgba(0,0,0,0.5)]"
            >
              <Undo2 className="h-4 w-4" aria-hidden />
              回到标题
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
