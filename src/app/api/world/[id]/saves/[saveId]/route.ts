// ============ API 路由：单个存档操作 ============
import { NextRequest, NextResponse } from 'next/server';
import { worldManager } from '@/server/engine';
import { prisma } from '@/server/prisma';

// GET /api/world/[id]/saves/[saveId] - 获取存档详情
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; saveId: string }> }) {
  try {
    const { saveId } = await params;
    const save = await prisma.save.findUnique({ where: { id: saveId } });
    if (!save) return NextResponse.json({ error: 'Save not found' }, { status: 404 });
    return NextResponse.json({ save });
  } catch (e) {
    console.error('[API] Get save error:', e);
    return NextResponse.json({ error: 'Failed to get save' }, { status: 500 });
  }
}

// POST /api/world/[id]/saves/[saveId]/load - 加载存档
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; saveId: string }> }) {
  try {
    const { id, saveId } = await params;
    const world = worldManager.getWorld(id);
    if (!world) return NextResponse.json({ error: 'World not loaded' }, { status: 404 });

    await world.loadSave(saveId);
    return NextResponse.json({ success: true, state: world.getSnapshot() });
  } catch (e) {
    console.error('[API] Load save error:', e);
    return NextResponse.json({ error: 'Failed to load save' }, { status: 500 });
  }
}

// DELETE /api/world/[id]/saves/[saveId] - 删除存档
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; saveId: string }> }) {
  try {
    const { saveId } = await params;
    await prisma.save.delete({ where: { id: saveId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[API] Delete save error:', e);
    return NextResponse.json({ error: 'Failed to delete save' }, { status: 500 });
  }
}