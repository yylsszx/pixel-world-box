// ============ API 路由：存档管理 ============
import { NextRequest, NextResponse } from 'next/server';
import { worldManager } from '@/server/engine';
import { prisma } from '@/server/prisma';

// GET /api/world/[id]/saves - 列出存档
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const saves = await prisma.save.findMany({
      where: { worldId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, description: true, tick: true, year: true, season: true, isAuto: true, createdAt: true },
    });
    return NextResponse.json({ saves });
  } catch (e) {
    console.error('[API] List saves error:', e);
    return NextResponse.json({ error: 'Failed to list saves' }, { status: 500 });
  }
}

// POST /api/world/[id]/saves - 创建存档
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, playerId } = body;

    if (!name || !playerId) {
      return NextResponse.json({ error: 'Missing name or playerId' }, { status: 400 });
    }

    const world = worldManager.getWorld(id);
    if (!world) return NextResponse.json({ error: 'World not loaded' }, { status: 404 });

    const save = await world.createSave(name, description || '', playerId);
    return NextResponse.json({ save });
  } catch (e) {
    console.error('[API] Create save error:', e);
    return NextResponse.json({ error: 'Failed to create save' }, { status: 500 });
  }
}