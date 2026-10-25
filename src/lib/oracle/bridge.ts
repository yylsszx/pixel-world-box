// ============ 神谕 Agent 工具执行器（客户端桥） ============
// 23 个工具的真身：查询类直读活引擎（浏览器内存中的模拟实例），
// 行动类行使神力/热改参数/书写法则——全部零延迟作用于正在运行的世界。
// 纯 TS 无 SDK 依赖（z-ai-web-dev-sdk 只活在 /api/oracle/agent 路由里）。
import type { GameEngine } from '@/lib/game/engine';
import type { AgentToolResult } from './types';
import { runExt } from './bridge-ext';
import { buildOracleContext } from '@/lib/game/oracle';
import { listEngineParams, getEngineParam, setEngineParam } from '@/lib/game/engineParams';
import { resolveRace } from '@/lib/game/agentLaws';
import { RACES, CASUS_META } from '@/lib/game/types';
import { T } from '@/lib/game/types';
import { W, H } from '@/lib/game/constants';
import { CELL, AW } from '@/lib/game/nature';

/** 地形 id → 中文名（get_tile/terrain_paint 报文用） */
export const TERRAIN_LABEL: Record<number, string> = {
  [T.DEEP]: '深海', [T.WATER]: '浅海', [T.SAND]: '沙漠', [T.GRASS]: '草原', [T.FOREST]: '森林',
  [T.HILL]: '丘陵', [T.MOUNTAIN]: '山脉', [T.SNOW]: '雪原', [T.LAVA]: '岩浆', [T.BURNT]: '焦土', [T.ICE]: '冰面',
};
const TERRAIN_KEY: Record<string, number> = {
  water: T.WATER, deep: T.DEEP, sand: T.SAND, grass: T.GRASS, forest: T.FOREST,
  hill: T.HILL, mountain: T.MOUNTAIN, snow: T.SNOW, burnt: T.BURNT, lava: T.LAVA, ice: T.ICE,
};
const LAW_LABEL: Record<string, string> = {
  wars: '王国宣战', cityGrowth: '城市扩张', reproduction: '生物繁衍', banditRaids: '强盗袭击',
  dragonSpawns: '巨龙降临', zombieInfect: '僵尸感染', undeadRise: '亡者复生', rebels: '叛乱分裂',
  tectonics: '板块构造', atmosphere: '大气环流', seasons: '四季轮转', naturalDisasters: '自然灾害',
};

// ---- 参数 coercion 工具（args 来自模型 JSON，防御式解析） ----
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);

/** 把任意结果压成 LLM 友好的紧凑 JSON（数值 round 2 位；字符串截断 4000） */
function pack<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => {
      if (typeof v === 'number') return Math.round(v * 100) / 100;
      if (typeof v === 'string' && v.length > 4000) return v.slice(0, 4000) + '…';
      return v;
    })
  ) as T;
}

/** 执行一个工具调用；eng 为活引擎实例（调用方从 gameStore 取） */
export function executeOracleTool(eng: GameEngine, name: string, args: Record<string, unknown>): AgentToolResult {
  try {
    const data = run(eng, name, args);
    return { id: '', ok: true, data: pack(data) };
  } catch (e) {
    return { id: '', ok: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function run(eng: GameEngine, name: string, a: Record<string, unknown>): unknown {
  switch (name) {
    // ================= 查询类 =================
    case 'get_world_digest':
      return { digest: buildOracleContext(eng) };

    case 'get_kingdoms': {
      const alive = eng.civs.filter((c) => c.alive);
      return {
        count: alive.length,
        kingdoms: alive
          .sort((x, y) => y.pop - x.pop)
          .slice(0, 20)
          .map((c) => {
            const info = eng.getCivInfo(c.id);
            return { name: c.name, race: info?.raceName ?? '?', gov: info?.govName ?? '?', king: c.kingName, pop: c.pop, army: info?.army ?? 0, tech: info?.techCount ?? 0, stability: info?.stability ?? 0, wars: info?.wars ?? [] };
          }),
      };
    }

    case 'get_kingdom': {
      const q = str(a.name).trim();
      if (!q) throw new Error('缺少参数 name');
      const c = eng.civs.find((x) => x.alive && (x.name === q || x.name.includes(q)));
      if (!c) throw new Error(`没有名为「${q}」的王国（可用 get_kingdoms 查看现存列国）`);
      const info = eng.getCivInfo(c.id);
      if (!info) throw new Error('王国数据不可用');
      return info;
    }

    case 'get_units': {
      const raceQ = str(a.race).trim();
      const civQ = str(a.kingdom).trim();
      const limit = Math.max(1, Math.min(30, Math.round(num(a.limit, 12))));
      let civId = -2; // -2 = 不过滤
      if (civQ) {
        const c = eng.civs.find((x) => x.alive && (x.name === civQ || x.name.includes(civQ)));
        if (!c) throw new Error(`没有名为「${civQ}」的王国`);
        civId = c.id;
      }
      const raceId = raceQ ? resolveRace(raceQ) : null;
      if (raceQ && raceId === null) throw new Error(`未知种族「${raceQ}」`);
      const out: unknown[] = [];
      for (const u of eng.units) {
        if (u.dead) continue;
        if (raceId !== null && u.race !== raceId) continue;
        if (civId !== -2 && u.civ !== civId) continue;
        out.push({
          id: u.id, name: u.name ?? '无名', race: RACES[u.race]?.name ?? '?',
          kingdom: u.civ >= 0 ? eng.civs[u.civ]?.name ?? null : '野外',
          hp: `${Math.ceil(u.hp)}/${u.maxHp}`, kills: u.kills, x: Math.round(u.x), y: Math.round(u.y),
          trait: u.trait ?? null, job: u.job ?? null,
          family: u.fam != null ? (eng.families.get(u.fam)?.name ?? '?') : null,
        });
        if (out.length >= limit) break;
      }
      return { matched: out.length, units: out };
    }

    case 'get_unit': {
      const id = Math.round(num(a.id, -1));
      const info = eng.getUnitInfo(id);
      if (!info) throw new Error(`没有 id=${id} 的单位（用 get_units 检索）`);
      const famName = info.fam != null ? eng.families.get(info.fam)?.name ?? null : null;
      return { ...info, famName, grudges: info.gIds?.length ?? 0 };
    }

    case 'get_tile': {
      const x = Math.round(num(a.x, -1));
      const y = Math.round(num(a.y, -1));
      if (x < 0 || y < 0 || x >= W || y >= H) throw new Error(`坐标越界（世界为 ${W}×${H}）`);
      const i = y * W + x;
      const ws = eng.worldsim;
      const c = eng.nature.cellOf(x, y);
      const ownerId = eng.owner[i];
      const units = eng.units.filter((u) => !u.dead && Math.floor(u.x) === x && Math.floor(u.y) === y).slice(0, 6).map((u) => ({ id: u.id, name: u.name ?? '无名', race: RACES[u.race]?.name ?? '?', hp: `${Math.ceil(u.hp)}/${u.maxHp}` }));
      return {
        x, y,
        terrain: TERRAIN_LABEL[eng.terrain[i]] ?? `地形#${eng.terrain[i]}`,
        elevation: ws.elev[i], temperature: ws.tempF[i], soilFertility: ws.soilF[i],
        glacier: ws.glacier[i], humidity: eng.nature.moist[c], raining: eng.nature.rainCell[c] > 60,
        river: eng.riverDir[i] > 0, road: eng.road[i] > 0, building: eng.building[i] > 0,
        owner: ownerId >= 0 ? eng.civs[ownerId]?.name ?? '?' : '无主之地',
        units,
      };
    }

    case 'get_region': {
      const x = Math.round(num(a.x, -1));
      const y = Math.round(num(a.y, -1));
      const r = Math.max(2, Math.min(20, Math.round(num(a.radius, 6))));
      if (x < 0 || y < 0 || x >= W || y >= H) throw new Error(`中心坐标越界（世界为 ${W}×${H}）`);
      const terrainCount = new Map<string, number>();
      const ownerCount = new Map<string, number>();
      const raceCount = new Map<string, number>();
      const r2 = r * r;
      let n = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) {
          if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
          const i = yy * W + xx;
          n++;
          const tl = TERRAIN_LABEL[eng.terrain[i]] ?? '?';
          terrainCount.set(tl, (terrainCount.get(tl) ?? 0) + 1);
          const oi = eng.owner[i];
          if (oi >= 0) {
            const on = eng.civs[oi]?.name ?? '?';
            ownerCount.set(on, (ownerCount.get(on) ?? 0) + 1);
          }
        }
      }
      for (const u of eng.units) {
        if (u.dead) continue;
        if ((u.x - x) ** 2 + (u.y - y) ** 2 > r2) continue;
        const rn = RACES[u.race]?.name ?? '?';
        raceCount.set(rn, (raceCount.get(rn) ?? 0) + 1);
      }
      const pct = (m: Map<string, number>) => [...m.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k, v]) => `${k}:${Math.round((v / Math.max(1, n)) * 100)}%`);
      return { x, y, radius: r, tiles: n, terrain: pct(terrainCount), owners: [...ownerCount.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k, v]) => `${k}:${v}格`), creatures: [...raceCount.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8).map(([k, v]) => `${k}×${v}`) };
    }

    case 'get_ecology': {
      let herb = 0;
      let pred = 0;
      let wild = 0;
      let civ = 0;
      for (const u of eng.units) {
        if (u.dead) continue;
        const d = RACES[u.race];
        if (!d) continue;
        if (d.isCiv) civ++;
        else {
          wild++;
          if (d.predator) pred++;
          else herb++;
        }
      }
      return { state: eng.ecoState, grassTiles: eng.grassTiles, civilization: civ, wildlife: wild, herbivores: herb, predators: pred, dynamicSpecies: [...eng.dynRaces.keys()].length };
    }

    case 'get_nature':
      return eng.nature.snapshot();

    case 'get_neuro':
      return eng.neuroInfo();

    case 'get_societal':
      return eng.societalInfo();

    case 'get_wars': {
      const wars = [...eng.warData.values()].map((w) => {
        const ca = eng.civs[w.a];
        const cb = eng.civs[w.b];
        return {
          a: ca?.name ?? '?', b: cb?.name ?? '?',
          reason: CASUS_META[w.reason]?.label ?? '战争',
          years: Math.max(1, Math.floor(eng.yearF) - w.startYear),
          battles: w.battles, casualties: [Math.round(w.casA), Math.round(w.casB)],
          score: [Math.round(w.scoreA), Math.round(w.scoreB)],
          total: !!w.total,
        };
      });
      const ww = eng.worldWar && eng.worldWar.phase !== 'idle' ? { phase: eng.worldWar.phase, belligerents: eng.worldWar.belligerents.length, kills: eng.worldWar.kills } : null;
      return { wars, worldWar: ww, alliances: eng.alliances.map((al) => ({ name: al.name, leader: eng.civs[al.leader]?.name ?? '?', members: al.members.length, cohesion: Math.round(al.cohesion) })) };
    }

    case 'get_events': {
      const limit = Math.max(1, Math.min(40, Math.round(num(a.limit, 15))));
      return { events: eng.worldEvents.slice(-limit).reverse().map((e) => ({ year: e.year, kind: e.kind, text: e.text, at: e.x != null ? `(${e.x},${e.y})` : null })) };
    }

    case 'get_laws':
      return { laws: Object.entries(eng.laws).map(([k, v]) => ({ key: k, label: LAW_LABEL[k] ?? k, on: v })) };

    case 'get_params': {
      const list = listEngineParams(str(a.filter) || undefined);
      return { count: list.length, groups: [...new Set(list.map((m) => m.group))], params: list.map((m) => ({ path: m.path, label: m.label, value: m.value, min: m.min, max: m.max, desc: m.desc })) };
    }

    case 'get_param': {
      const p = getEngineParam(str(a.path));
      if (!p) throw new Error(`未知参数 ${str(a.path)}`);
      return p;
    }

    // ================= 行动类 =================
    case 'set_law': {
      const key = str(a.key).trim();
      const on = bool(a.on, true);
      if (!(key in eng.laws)) throw new Error(`未知法则 ${key}（可用：${Object.keys(eng.laws).join('/')}）`);
      (eng.laws as unknown as Record<string, boolean>)[key] = on;
      eng.toast(`${LAW_LABEL[key] ?? key} 已${on ? '开启' : '关闭'}`, on ? 'info' : 'danger');
      return { key, label: LAW_LABEL[key] ?? key, on };
    }

    case 'set_param': {
      const path = str(a.path).trim();
      const value = num(a.value, NaN);
      if (Number.isNaN(value)) throw new Error('value 必须是数字');
      const before = getEngineParam(path);
      const err = setEngineParam(path, value);
      if (err) throw new Error(err);
      return { path, before: before?.value ?? null, after: getEngineParam(path)?.value ?? null };
    }

    case 'god_power':
      // v5：统一重定向 → divine_power（32 种神力全量目录；旧 9 种神力名完全兼容）
      return runExt(eng, 'divine_power', a);

    case 'spawn_creatures': {
      const race = str(a.race).trim();
      const count = Math.max(1, Math.min(50, Math.round(num(a.count, 5))));
      const rid = resolveRace(race);
      if (rid === null) {
        const names = Object.values(RACES).filter(Boolean).slice(0, 24).map((d) => d.name).join('、');
        throw new Error(`未知种族「${race}」。可用示例：${names}`);
      }
      // v5：缺省落点 = 相机中心（造物主看得见生成）；radius 散布半径 1-8（缺省 2）
      const cam = { x: eng.cam.x, y: eng.cam.y };
      const hasXY = typeof a.x === 'number' && typeof a.y === 'number';
      const x = hasXY ? Math.max(0, Math.min(W - 1, num(a.x, 0))) : Math.max(0, Math.min(W - 1, cam.x));
      const y = hasXY ? Math.max(0, Math.min(H - 1, num(a.y, 0))) : Math.max(0, Math.min(H - 1, cam.y));
      const spread = Math.max(1, Math.min(8, Math.round(num(a.radius, 2))));
      let n = 0;
      for (let k = 0; k < count; k++) {
        const sx = k === 0 ? x : x + (Math.random() - 0.5) * spread * 2;
        const sy = k === 0 ? y : y + (Math.random() - 0.5) * spread * 2;
        if (eng.spawnUnit(rid, sx, sy, { silent: true })) n++; // 真实计数（落点失败不计）
      }
      return { spawned: n, race: RACES[rid]?.name ?? '?', at: [Math.round(x), Math.round(y)], note: hasXY ? undefined : '（未指定坐标 → 相机中心）' };
    }

    case 'terrain_paint': {
      const t = TERRAIN_KEY[str(a.terrain).trim()];
      if (t === undefined) throw new Error(`未知地形 ${str(a.terrain)}（可用：${Object.keys(TERRAIN_KEY).join('/')}）`);
      const x = Math.round(num(a.x, -1));
      const y = Math.round(num(a.y, -1));
      const r = Math.max(1, Math.min(12, Math.round(num(a.radius, 3))));
      if (x < 0 || y < 0 || x >= W || y >= H) throw new Error(`坐标越界（世界为 ${W}×${H}）`);
      let n = 0;
      const r2 = r * r;
      for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) {
          if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
          eng.setTerrain(yy * W + xx, t);
          n++;
        }
      }
      return { painted: n, terrain: TERRAIN_LABEL[t], at: [x, y], radius: r };
    }

    case 'create_law': {
      // v2：透传结构化触发器（trigger 对象优先；顶层 event/cond 兼容）
      const trig = (typeof a.trigger === 'object' && a.trigger !== null ? a.trigger : undefined) as
        | { kind?: string; everyYears?: number; chance?: number; season?: number | null; event?: string; eventCooldownYears?: number; cond?: unknown }
        | undefined;
      const err = eng.agentLaws.create({
        name: str(a.name),
        desc: str(a.desc),
        everyYears: num(a.everyYears, 10),
        chance: num(a.chance, 1),
        season: a.season == null ? null : num(a.season, 0),
        durationYears: a.durationYears == null ? null : num(a.durationYears, 100),
        trigger: trig != null || a.event != null || a.cond != null
          ? { ...(trig ?? {}), event: trig?.event ?? (a.event != null ? str(a.event) : undefined), cond: trig?.cond ?? a.cond }
          : undefined,
        event: trig == null && a.event != null ? str(a.event) : undefined,
        cond: trig == null && a.cond != null ? a.cond : undefined,
        actions: Array.isArray(a.actions) ? a.actions : [],
      });
      if (err) throw new Error(err);
      const law = eng.agentLaws.laws[eng.agentLaws.laws.length - 1];
      return { created: true, law: { id: law.id, name: law.name, desc: law.desc, trigger: law.trigger, durationYears: law.durationYears, actions: law.actions } };
    }

    case 'manage_agent_laws': {
      const action = str(a.action, 'list');
      if (action === 'list') return { laws: eng.agentLaws.list() };
      const id = str(a.id).trim();
      if (!id) throw new Error('缺少参数 id');
      if (action === 'toggle') {
        const ok = eng.agentLaws.toggle(id, bool(a.enabled, true));
        if (!ok) throw new Error(`没有 id=${id} 的法则`);
        return { toggled: id, enabled: bool(a.enabled, true) };
      }
      if (action === 'remove') {
        const ok = eng.agentLaws.remove(id);
        if (!ok) throw new Error(`没有 id=${id} 的法则`);
        return { removed: id };
      }
      throw new Error('action 只支持 list/toggle/remove');
    }

    default:
      // v2：35 个扩展工具（单位改写/王国操控/外交战争/基因/纪元/时间镜头/存档/特效/机制改写…）
      return runExt(eng, name, a);
  }
}

/** 给结果补 id（agent 循环侧调用后回填） */
export function withId(r: AgentToolResult, id: string): AgentToolResult {
  return { ...r, id };
}

/** 导出给 prompt 构建/前端展示的粗网格说明（保持与 nature.ts 一致） */
export const GRID_INFO = { W, H, cell: CELL, aw: AW };
