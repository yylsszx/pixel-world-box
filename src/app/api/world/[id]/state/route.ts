// ============ API 路由：世界状态同步 ============
import { NextRequest, NextResponse } from 'next/server';
import { worldManager } from '@/server/engine';

// GET /api/world/[id]/state - 获取完整世界状态
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const world = worldManager.getWorld(id);
    if (!world) {
      // 尝试从数据库加载
      const loaded = await worldManager.loadWorld(id);
      if (!loaded) return NextResponse.json({ error: 'World not found' }, { status: 404 });
      return NextResponse.json({ state: loaded.getSnapshot() });
    }
    return NextResponse.json({ state: world.getSnapshot() });
  } catch (e) {
    console.error('[API] Get world state error:', e);
    return NextResponse.json({ error: 'Failed to get world state' }, { status: 500 });
  }
}