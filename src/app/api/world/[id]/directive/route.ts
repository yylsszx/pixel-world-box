// ============ API 路由：指令执行 ============
import { NextRequest, NextResponse } from 'next/server';
import { worldManager } from '@/server/engine';

// POST /api/world/[id]/directive - 执行玩家指令
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { playerId, directive } = body;

    if (!playerId || !directive) {
      return NextResponse.json({ error: 'Missing playerId or directive' }, { status: 400 });
    }

    const world = worldManager.getWorld(id);
    if (!world) return NextResponse.json({ error: 'World not loaded' }, { status: 404 });

    const result = await world.executeDirective(playerId, directive);
    return NextResponse.json({ result });
  } catch (e) {
    console.error('[API] Execute directive error:', e);
    return NextResponse.json({ error: 'Failed to execute directive' }, { status: 500 });
  }
}