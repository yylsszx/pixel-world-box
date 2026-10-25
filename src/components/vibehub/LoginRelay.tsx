'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * VibeHub CLI 登录中继浮标（仅 development 构建）。
 *
 * 背景：沙箱内任何后台进程都会在工具调用结束时被回收，`vibehub login`
 * 无法常驻轮询。方案：包装脚本（.zscripts/vibehub-login-window.sh）在单次
 * 长调用内运行 CLI，把验证码/授权地址写入 /tmp/vh-login-status.json；
 * 本组件轮询 /api/vh-login-status 并在窗口开启时于预览面板展示授权
 * 入口，用户点击完成浏览器确认，CLI 轮询随即取得 Token —— 全程闭环。
 *
 * 生产构建（NODE_ENV=production）下整棵子树不渲染、零网络请求；
 * 静态导出时 API 路由不存在，fetch 404 后静默休眠。
 */

type RelayState = {
  status: 'starting' | 'waiting' | 'success' | 'failed' | 'retrying';
  code?: string;
  url?: string;
  ts?: number;
  attempt?: number;
};

export function VibeHubLoginRelay() {
  const [state, setState] = useState<RelayState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const lastKeyRef = useRef('');
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const probe = useCallback(async () => {
    try {
      const res = await fetch('/api/vh-login-status', { cache: 'no-store' });
      if (!res.ok) return; // 中继未开启：保持静默休眠
      const data = (await res.json()) as RelayState;
      const key = `${data.status}:${data.ts ?? 0}`;
      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key;
        if (data.status === 'waiting') {
          // 新窗口开启：撤销旧的手动关闭，重新点亮
          setDismissed(false);
        } else {
          // 终态：限时自动隐藏
          if (hideRef.current) clearTimeout(hideRef.current);
          hideRef.current = setTimeout(
            () => setDismissed(true),
            data.status === 'success' ? 8000 : 20000,
          );
        }
      }
      setState(data);
    } catch {
      // 静态导出（无 API 路由）或网络抖动：静默
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(probe, 300);
    const iv = setInterval(probe, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      if (hideRef.current) clearTimeout(hideRef.current);
    };
  }, [probe]);

  if (!state || dismissed) return null;

  if (state.status === 'starting' || state.status === 'retrying') {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] rounded-md border border-amber-400/40 bg-[#0d1b2e]/95 px-4 py-2 shadow-2xl backdrop-blur">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-amber-300/80">
          {state.status === 'retrying'
            ? '🔄 链接刷新中，请稍候最新验证码…'
            : '⏳ VIBEHUB 登录中继连接中…'}
        </p>
      </div>
    );
  }

  if (state.status === 'success') {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] rounded-md border border-emerald-400/60 bg-emerald-950/95 px-4 py-3 shadow-2xl backdrop-blur">
        <p className="font-mono text-xs font-bold tracking-widest text-emerald-300">✅ VIBEHUB LOGIN OK</p>
        <p className="mt-1 text-[11px] text-emerald-200/80">登录成功，发布流程继续中…</p>
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] rounded-md border border-red-400/60 bg-red-950/95 px-4 py-3 shadow-2xl backdrop-blur">
        <p className="font-mono text-xs font-bold tracking-widest text-red-300">❌ VIBEHUB LOGIN FAILED</p>
        <p className="mt-1 text-[11px] text-red-200/80">窗口超时或未完成确认，等待重新发起</p>
      </div>
    );
  }

  // waiting：展示验证码 + 授权按钮
  return (
    <div
      role="dialog"
      aria-label="VibeHub 账号登录"
      className="fixed bottom-4 right-4 z-[9999] w-[300px] animate-pulse rounded-md border-2 border-amber-400/80 bg-[#0d1b2e]/95 px-4 py-3 shadow-2xl shadow-amber-500/20 backdrop-blur"
      style={{ animationDuration: '2.5s' }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-amber-300">
          🔐 VibeHub 登录
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded px-1.5 text-xs text-amber-200/60 transition-colors hover:bg-amber-400/20 hover:text-amber-200"
          aria-label="关闭登录提示"
        >
          ✕
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-amber-100/80">
        登录窗口已开启。验证码：
        <span className="mx-1 font-mono text-sm font-bold tracking-[0.2em] text-amber-300">
          {state.code ?? '····-····'}
        </span>
      </p>
      <a
        href={state.url ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!state.url) e.preventDefault();
        }}
        className="mt-2 block w-full rounded border border-amber-400 bg-amber-400/90 px-3 py-2 text-center font-mono text-xs font-bold tracking-widest text-[#0d1b2e] transition-colors hover:bg-amber-300"
      >
        打开授权页面 →
      </a>
      {/* 预览面板 iframe 会拦截新窗口：把链接同时以可复制文本展示 */}
      {state.url && (
        <p className="mt-1.5 break-all font-mono text-[9px] leading-relaxed text-amber-200/60 select-all">
          {state.url}
        </p>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-amber-200/50">
        在新页面核对验证码并点击确认；确认后此窗口自动变绿。若按钮无效（预览面板拦截弹窗），请复制上方链接到浏览器打开。
      </p>
    </div>
  );
}
