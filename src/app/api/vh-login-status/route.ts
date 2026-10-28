import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';

export const dynamic = 'force-dynamic';

/**
 * VibeHub CLI 登录中继（仅开发预览用）。
 * 读取 /tmp/vh-login-status.json —— 由登录包装脚本在 10 分钟窗口内实时写入：
 *   { status: "waiting" | "success" | "failed", code, url, ts }
 * 静态导出时整个 api 目录会被 .zscripts/export-static.sh 暂移，本路由不存在；
 * 生产构建下前端组件也不会渲染（NODE_ENV 门控），双向零影响。
 */
export async function GET() {
  try {
    const raw = await readFile('/tmp/vh-login-status.json', 'utf-8');
    const data = JSON.parse(raw) as { status: string; code?: string; url?: string; ts?: number };
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'inactive' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}
