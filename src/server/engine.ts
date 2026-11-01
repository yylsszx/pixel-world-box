// ============ 服务端模拟引擎核心 ============
import { PrismaClient } from '@prisma/client';
import type { SaveDataV2, WorldGenParams } from '@/lib/game/types';
import { generateWorld } from '@/lib/game/worldgen';
import { TICK_MS, YEAR_TICKS, W, H, MAX_UNITS } from '@/lib/game/constants';
import { WB } from '@/lib/wasm/wbspatial';
import { WorldSim } from '@/lib/game/worldsim';
import { AgentLawSystem } from '@/lib/game/agentLaws';

const prisma = new PrismaClient();

export class ServerWorldManager {
  private worlds: Map<string, ServerWorld> = new Map();
  private tickIntervals: Map<string, NodeJS.Timeout> = new Map();

  async createWorld(params: {
    name: string; seed: string; genParams: WorldGenParams;
    ownerId: string; isPublic?: boolean; maxPlayers?: number;
  }) {
    const worldGen = generateWorld(params.genParams, params.seed);
    const initialState: SaveDataV2 = {
      v: 2, W, H, seed: params.seed, genParams: params.genParams,
      tick: 0, year: 0, season: 0, variant: '',
      terrain: worldGen.terrain, height: worldGen.height,
      water: worldGen.water, biome: worldGen.biome,
      civs: [], units: [], items: [], buildings: [],
      armies: [], families: [], dragons: [], demons: [],
      wildlife: [], effects: [], decals: [], events: [],
      triggers: [], laws: [], creations: [],
      neuroWeights: { acc: {w1:[],b1:[],w2:[],b2:[]}, stance: {w1:[],b1:[],w2:[],b2:[]}, flight: {w1:[],b1:[],w2:[],b2:[]} },
      worldWar: null, warShame: [], hostNat: null,
      unitSeq: 0, civSeq: 0, itemSeq: 0, buildingSeq: 0,
      armySeq: 0, familySeq: 0, dragonSeq: 0, demonSeq: 0,
      wildlifeSeq: 0, effectSeq: 0, decalSeq: 0, eventSeq: 0,
      triggerSeq: 0, lawSeq: 0, creationSeq: 0,
    };
    const world = await prisma.world.create({
      data: { name: params.name, seed: params.seed, params: params.genParams as any,
        state: initialState as any, ownerId: params.ownerId,
        isPublic: params.isPublic ?? false, maxPlayers: params.maxPlayers ?? 8 },
    });
    const serverWorld = new ServerWorld(world.id, initialState);
    this.worlds.set(world.id, serverWorld);
    this.startTickLoop(world.id);
    return world;
  }

  async loadWorld(worldId: string) {
    if (this.worlds.has(worldId)) return this.worlds.get(worldId)!;
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) throw new Error(`World not found: ${worldId}`);
    const serverWorld = new ServerWorld(world.id, world.state as SaveDataV2);
    this.worlds.set(worldId, serverWorld);
    this.startTickLoop(worldId);
    return serverWorld;
  }

  getWorld(worldId: string): ServerWorld | undefined { return this.worlds.get(worldId); }

  private startTickLoop(worldId: string) {
    if (this.tickIntervals.has(worldId)) return;
    const interval = setInterval(async () => {
      const world = this.worlds.get(worldId);
      if (world) { await world.tick(); if (world.state.tick % 100 === 0) await this.persistWorld(worldId); }
    }, TICK_MS);
    this.tickIntervals.set(worldId, interval);
  }

  stopTickLoop(worldId: string) {
    const interval = this.tickIntervals.get(worldId);
    if (interval) { clearInterval(interval); this.tickIntervals.delete(worldId); }
  }

  async persistWorld(worldId: string) {
    const world = this.worlds.get(worldId); if (!world) return;
    await prisma.world.update({
      where: { id: worldId }, data: { state: world.state as any, tick: world.state.tick, year: world.state.year, season: world.state.season, updatedAt: new Date() },
    });
  }

  async shutdownWorld(worldId: string) {
    this.stopTickLoop(worldId);
    const world = this.worlds.get(worldId);
    if (world) { await this.persistWorld(worldId); this.worlds.delete(worldId); }
  }

  getActiveWorlds(): ServerWorld[] { return Array.from(this.worlds.values()); }
}

export class ServerWorld {
  public state: SaveDataV2;
  private worldSim: WorldSim;
  private agentLaws: AgentLawSystem;
  private wasmInitialized: boolean = false;
  private tickCount: number = 0;

  constructor(worldId: string, initialState: SaveDataV2) {
    this.state = initialState;
    this.worldSim = new WorldSim(this.state);
    this.agentLaws = new AgentLawSystem(this.state);
  }

  private async initWasm() {
    if (this.wasmInitialized) return;
    try { await WB.init(W, H, MAX_UNITS); this.wasmInitialized = true; console.log('[ServerWorld] WASM initialized'); }
    catch (e) { console.warn('[ServerWorld] WASM init failed:', e); }
  }

  async tick(): Promise<void> {
    await this.initWasm(); this.tickCount++;
    this.worldSim.tick(); this.agentLaws.tick(this.state);
    if (this.wasmInitialized) this.rebuildWasmBuckets();
    this.state.tick++;
    if (this.state.tick % YEAR_TICKS === 0) { this.state.year++; this.state.season = (this.state.season + 1) % 4; }
  }

  private rebuildWasmBuckets() {
    for (let i = 0; i < this.state.units.length; i++) {
      const u = this.state.units[i]; if (u && !u.dead) WB.sync_pos(i, u.x, u.y);
    }
    WB.pack_end(this.state.units.length);
  }

  async executeDirective(playerId: string, directive: any): Promise<any> { return { success: true }; }
  getSnapshot(): SaveDataV2 { return this.state; }
  getDelta(sinceTick: number): any { return this.state; }

  async createSave(name: string, description: string, playerId: string) {
    return await prisma.save.create({ data: { worldId: this.state.id || '', name, description, data: this.state as any, tick: this.state.tick, year: this.state.year, season: this.state.season, createdById: playerId } });
  }

  async loadSave(saveId: string) {
    const save = await prisma.save.findUnique({ where: { id: saveId } }); if (!save) throw new Error('Save not found');
    this.state = save.data as SaveDataV2;
    this.worldSim = new WorldSim(this.state); this.agentLaws = new AgentLawSystem(this.state);
    if (this.wasmInitialized) { WB.reset(); this.rebuildWasmBuckets(); }
  }
}

export const worldManager = new ServerWorldManager();