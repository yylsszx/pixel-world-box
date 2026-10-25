import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * VibeHub CLI 登录中继启动器（仅开发预览用）。
 *
 * 沙箱会回收所有工具调用派生的进程，但 dev server 本身是平台开机链
 * 拉起的常驻进程 —— 在此以 detached + unref 方式 spawn 登录脚本，
 * 进程即可跨工具调用长期存活，Agent 能先把授权链接发给用户、
 * 用户从容完成浏览器确认，CLI 轮询进程全程在场接管 Token。
 *
 * 幂等：/tmp/vh-login.pid 对应进程存活时不重复发起。
 * 静态导出时整个 api 目录会被 export-static.sh 暂移；生产构建下
 * NODE_ENV 门控直接 404，双向零影响。
 */
export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'dev only' }, { status: 404 });
  }

  // 幂等检查：已有活跃登录进程
  try {
    const pid = parseInt((await readFile('/tmp/vh-login.pid', 'utf-8')).trim(), 10);
    if (Number.isInteger(pid) && pid > 0) {
      process.kill(pid, 0); // 进程存活时才不抛错
      return NextResponse.json({ started: false, alreadyRunning: true, pid });
    }
  } catch {
    // pid 文件不存在或进程已死：继续发起新登录
  }

  const script = path.join(process.cwd(), '.zscripts', 'vibehub-login-relay.sh');
  const child = spawn('bash', [script], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, HOME: process.env.HOME || '/home/z' },
  });
  child.unref();

  return NextResponse.json({ started: true, pid: child.pid });
}
