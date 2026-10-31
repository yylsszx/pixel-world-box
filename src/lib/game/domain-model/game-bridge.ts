// ============ DomainModel — 游戏引擎集成桥接层 ============
// 把 DomainModel 接入 GameEngine：将引擎世界状态编码为模型输入，
// 将模型输出解码为可执行的游戏动作，并可选地执行（通过引擎 API）。
// 这是“专业领域小模型”在游戏中的实际落地点：战略决策、文明 AI、外交时机。
import { GameEngine } from '../engine';
import { DomainModel, DEFAULT_SMALL_CONFIG, type WorldStateSnapshot, type ModelAction } from './model';
import { DomainTokenizer, encodeWorldState } from './tokenizer';
import { RACES } from '../types';

/** 从 GameEngine 抓取当前世界快照（领域编码所需的结构化数据） */
export function captureWorldState(eng: GameEngine): WorldStateSnapshot {
  const year = Math.floor(eng.yearF);
  const aliveCivs = eng.civs.filter((c) => c.alive);

  const civs = aliveCivs.map((c) => {
    const info = eng.getCivInfo(c.id);
    return {
      name: c.name,
      race: info?.raceName ?? '?',
      pop: c.pop,
      tiles: info?.tiles ?? 0,
      gold: info?.gold ?? 0,
      tech: info?.techCount ?? 0,
      stability: info?.stability ?? 0,
      wars: info?.wars ?? [],
    };
  });

  const units = eng.units
    .filter((u) => !u.dead)
    .slice(0, 200) // 限制单位数量，防序列过长
    .map((u) => {
      const race = RACES[u.race];
      const civ = u.civ >= 0 ? eng.civs[u.civ] : null;
      return {
        race: race?.name ?? `种族${u.race}`,
        hp: u.hp,
        kills: u.kills,
        x: u.x,
        y: u.y,
        civ: civ?.name,
      };
    });

  // 采样部分地形格（避免序列过长）
  const terrain: { type: string; x: number; y: number }[] = [];
  const terrainLabels: Record<number, string> = {
    0: '深海', 1: '浅海', 2: '沙滩', 3: '草原', 4: '森林', 5: '丘陵', 6: '山地',
    7: '雪原', 8: '岩浆', 9: '焦土', 10: '冰面', 11: '沼泽',
  };
  const step = Math.ceil((eng.terrain.length) / 200);
  for (let i = 0; i < eng.terrain.length; i += step) {
    const x = i % (eng as any).W ?? i % 256;
    const y = Math.floor(i / ((eng as any).W ?? 256));
    terrain.push({ type: terrainLabels[eng.terrain[i]] ?? '未知', x, y });
  }

  const events = eng.worldEvents.slice(-20).map((e) => ({
    kind: e.kind,
    text: e.text,
    year: e.year,
  }));

  return { year, civs, units, terrain, events };
}

/** 领域模型代理：在引擎 tick 中调用，生成战略决策 */
export class DomainModelAgent {
  readonly model: DomainModel;
  readonly tok: DomainTokenizer;
  private lastAction: ModelAction | null = null;
  private actionCooldown = 0; // tick 计数，防每 tick 都决策

  constructor(engine: GameEngine, cfg = DEFAULT_SMALL_CONFIG) {
    this.model = new DomainModel(cfg);
    this.tok = new DomainTokenizer();
  }

  /** 每 tick 调用：在冷却结束后对当前世界状态做一次战略推理 */
  think(eng: GameEngine): ModelAction | null {
    if (this.actionCooldown > 0) {
      this.actionCooldown--;
      return null;
    }

    const snap = captureWorldState(eng);
    const action = this.model.think(snap);
    this.lastAction = action;
    // 决策冷却：每 60 tick（约 4 秒@15tps）重新决策一次
    this.actionCooldown = 60;
    return action;
  }

  /** 把模型生成的动作应用到引擎（可选，用于 AI 控制文明） */
  applyAction(eng: GameEngine, action: ModelAction): boolean {
    try {
      switch (action.type) {
        case 'declare_war': {
          const target = action.target;
          if (!target) return false;
          const civ = eng.civs.find((c) => c.alive && c.name.includes(target));
          if (!civ) return false;
          // 调用引擎的宣战（若有对应 API）
          if (typeof (eng as any).declareWar === 'function') {
            (eng as any).declareWar(0, civ.id, 'conquest');
          }
          return true;
        }
        case 'make_peace': {
          const target = action.target;
          if (!target) return false;
          const civ = eng.civs.find((c) => c.alive && c.name.includes(target));
          if (!civ) return false;
          if (typeof (eng as any).makePeace === 'function') {
            (eng as any).makePeace(0, civ.id);
          }
          return true;
        }
        case 'spawn': {
          const race = action.target ?? '人类';
          const count = (action.params.value as number ?? 1);
          // 在世界中心附近放置
          const cx = 128, cy = 80;
          let spawned = 0;
          for (let k = 0; k < count; k++) {
            const ok = eng.spawnUnit(0, cx + (Math.random() - 0.5) * 4, cy + (Math.random() - 0.5) * 4, { silent: true });
            if (ok) spawned++;
          }
          return spawned > 0;
        }
        case 'wait':
        default:
          return true;
      }
    } catch (e) {
      console.warn('[DomainModelAgent] 动作执行失败:', e);
      return false;
    }
  }

  /** 导出模型当前 Int8 量化权重（供保存/热加载） */
  exportWeights() {
    return this.model.exportQuantized();
  }

  /** 参数量 */
  paramCount(): number { return this.model.paramCount(); }
}

/** 创建默认配置的领域模型代理（浏览器可用版本，~21M 参数） */
export function createDomainAgent(engine: GameEngine): DomainModelAgent {
  return new DomainModelAgent(engine, DEFAULT_SMALL_CONFIG);
}