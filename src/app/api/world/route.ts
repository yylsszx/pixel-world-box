// ============ API 路由：世界管理 ============
import { NextRequest, NextResponse } from 'next/server';
import { worldManager } from '@/server/engine';
import { prisma } from '@/server/prisma';

// POST /api/world - 创建新世界
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, seed, genParams, ownerId, isPublic, maxPlayers } = body;

    if (!name || !seed || !genParams || !ownerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const world = await worldManager.createWorld({ name, seed, genParams, ownerId, isPublic, maxPlayers });
    return NextResponse.json({ id: world.id, name: world.name });
  } catch (e) {
    console.error('[API] Create world error:', e);
    return NextResponse.json({ error: 'Failed to create world' }, { status: 500 });
  }
}

// GET /api/world - 列出世界
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('ownerId');
    const isPublic = searchParams.get('isPublic');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
    if (ownerId) where.ownerId = ownerId;
    if (isPublic !== null) where.isPublic = isPublic === 'true';

    const worlds = await prisma.world.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, seed: true, tick: true, year: true, season: true, isPublic: true, ownerId: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ worlds });
  } catch (e) {
    console.error('[API] List worlds error:', e);
    return NextResponse.json({ error: 'Failed to list worlds' }, { status: 500 });
  }
}