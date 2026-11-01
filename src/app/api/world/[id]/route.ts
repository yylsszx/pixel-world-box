// ============ API 路由：单个世界 CRUD ============
import { NextRequest, NextResponse } from 'next/server';
import { worldManager } from '@/server/engine';
import { prisma } from '@/server/prisma';

// GET /api/world/[id] - 获取世界详情
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const world = await prisma.world.findUnique({
      where: { id },
      include: { owner: true, players: { include: { player: true } }, saves: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!world) return NextResponse.json({ error: 'World not found' }, { status: 404 });
    return NextResponse.json({ world });
  } catch (e) {
    console.error('[API] Get world error:', e);
    return NextResponse.json({ error: 'Failed to get world' }, { status: 500 });
  }
}

// PATCH /api/world/[id] - 更新世界设置
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, isPublic, maxPlayers } = body;

    const world = await prisma.world.update({
      where: { id },
      data: { name, isPublic, maxPlayers },
    });
    return NextResponse.json({ world });
  } catch (e) {
    console.error('[API] Update world error:', e);
    return NextResponse.json({ error: 'Failed to update world' }, { status: 500 });
  }
}

// DELETE /api/world/[id] - 删除世界
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await worldManager.shutdownWorld(id);
    await prisma.world.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[API] Delete world error:', e);
    return NextResponse.json({ error: 'Failed to delete world' }, { status: 500 });
  }
}