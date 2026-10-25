// ============ 神谕 Agent 扩展工具执行器（客户端桥 · v2 Harness） ============
// runExt：bridge.ts 的 default 分支委托到这里（41-c 接线）。
// 覆盖 L0-L6 扩展工具：世界大战/联盟/家族/演化/种族/兴衰史/成就/纪事检索/统计快照/
// 触发器/存档槽/能力自省 + 25+ 神力/单位改写/王国操控/外交/旨意/基因/大战/纪元/时间/镜头。
// 铁律：不修改引擎文件；对 41-a 并行开发的机制 v2（update_law/counters）只走防御式 unknown cast。
import type { GameEngine } from '@/lib/game/engine';
import { resolveRace } from '@/lib/game/agentLaws';
import { RACES, RACE_REL_BASE, JOBS, describeCond } from '@/lib/game/types';
import type { Unit, Civ, Effect, CasusKind, DirectiveKind } from '@/lib/game/types';
import { W, H } from '@/lib/game/constants';
import { ITEM_DEFS, RARITY_META, SLOT_NAMES } from '@/lib/game/items';
import { useGameStore } from '@/store/gameStore';
import { ACHIEVEMENTS } from '@/lib/game/achievements';
import { addCreation, patchCreation, removeCreation, listCreations, getCreation, describeCreation, hydrateOneItem } from '@/lib/game/creations';
import type { ItemCreation, SpeciesCreation, WeaponCreation } from '@/lib/game/creations';
import { AGENT_TOOLS, TOOL_LAYERS } from './tools';

// ---- 参数 coercion（与 bridge.ts 同款防御式解析，本地复制不引私有函数） ----
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const r2 = (v: number): number => Math.round(v * 100) / 100;
/** 缺省坐标的随机落点（沿用 bridge.ts 的 8+rng 模式，但用 Math.random 不动引擎种子序列） */
const rndX = (): number => Math.round(clamp(8 + Math.random() * (W - 16), 0, W - 1));
const rndY = (): number => Math.round(clamp(6 + Math.random() * (H - 12), 0, H - 1));
/** v5 神力/造物缺省坐标 = 相机中心（造物主视野内落地——「看不到效果」的精准执行修复） */
const camX = (eng: GameEngine): number => Math.round(clamp(eng.cam.x, 0, W - 1));
const camY = (eng: GameEngine): number => Math.round(clamp(eng.cam.y, 0, H - 1));
/** 可选数字（非有限数 → undefined，交由引擎用角色基线） */
const optNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** 可选布尔（宽松：true/false/1/0） */
const optBool = (v: unknown): boolean | undefined => {
  if (typeof v === 'boolean') return v;
  if (v === 1) return true;
  if (v === 0) return false;
  return undefined;
};

/** 全新造物可用体形族系（与引擎 FORM_ANCHOR 同源；决定精灵色板与身体构造） */
const FORM_KEYS = [
  'person', 'sheep', 'wolf', 'bear', 'dragon', 'deer', 'penguin', 'camel', 'scorpion', 'snake',
  'snowwolf', 'skeleton', 'demon', 'mage', 'troll', 'ogre', 'whitewalker', 'vampire', 'kraken', 'sandworm', 'basilisk',
] as const;
/** 体形族系 → baseKey/baseName（图鉴跨世界锚；与内置 RACES key 一致） */
const FORM_BASE: Record<string, { key: string; name: string }> = {
  person: { key: 'human', name: '人类' }, sheep: { key: 'sheep', name: '绵羊' }, wolf: { key: 'wolf', name: '狼' },
  bear: { key: 'bear', name: '熊' }, dragon: { key: 'dragon', name: '巨龙' }, deer: { key: 'deer', name: '鹿' },
  penguin: { key: 'penguin', name: '企鹅' }, camel: { key: 'camel', name: '骆驼' }, scorpion: { key: 'scorpion', name: '蝎子' },
  snake: { key: 'snake', name: '蛇' }, snowwolf: { key: 'snowwolf', name: '雪狼' }, skeleton: { key: 'skeleton', name: '骷髅' },
  demon: { key: 'demon', name: '恶魔' }, mage: { key: 'mage', name: '法师' }, troll: { key: 'troll', name: '巨魔' },
  ogre: { key: 'ogre', name: '食人魔' }, whitewalker: { key: 'whitewalker', name: '白行者' }, vampire: { key: 'vampire', name: '吸血鬼' },
  kraken: { key: 'kraken', name: '克拉肯' }, sandworm: { key: 'sandworm', name: '沙虫' }, basilisk: { key: 'basilisk', name: '蛇怪' },
};
/** 全新造物的生态角色属性基线（与引擎 ECO_BASE 同源——非任何模板的数值） */
const ECO_STATS: Record<string, { hp: number; dmg: number; speed: number; repro: number; maxAge: number; cap: number }> = {
  pred: { hp: 48, dmg: 12, speed: 0.085, repro: 0.0028, maxAge: 32, cap: 60 },
  herb: { hp: 24, dmg: 2, speed: 0.06, repro: 0.004, maxAge: 24, cap: 140 },
  neutral: { hp: 40, dmg: 6, speed: 0.08, repro: 0.0038, maxAge: 40, cap: 80 },
  civ: { hp: 62, dmg: 9, speed: 0.09, repro: 0.0055, maxAge: 65, cap: 0 },
};
/** 从 AI 参数构建全新视觉基因组 13 元组（未指定维度猛烈随机；root 由放置时的体形族系锚重指） */
function buildVisT(a: Record<string, unknown>, root = 0): number[] {
  const R = () => Math.random();
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return [
    root,
    Math.round(cl(optNum(a.hue) ?? (R() - 0.5) * 72, -40, 40)),
    Math.round(cl(optNum(a.lum) ?? 0.82 + R() * 0.32, 0.72, 1.28) * 100),
    Math.round(cl(optNum(a.size) ?? 0.85 + R() * 0.5, 0.8, 1.45) * 100),
    Math.round(cl(optNum(a.bulk) ?? R(), 0, 1) * 100),
    Math.round(cl(optNum(a.horns) ?? (R() < 0.4 ? 1 + (R() < 0.3 ? 1 : 0) : 0), 0, 2)),
    (optBool(a.spikes) ?? R() < 0.25) ? 1 : 0,
    (optBool(a.mane) ?? R() < 0.25) ? 1 : 0,
    Math.round(cl(optNum(a.tail) ?? Math.floor(R() * 3), 0, 2)),
    Math.round(cl(optNum(a.ears) ?? Math.floor(R() * 3), 0, 2)),
    (optBool(a.glow) ?? R() < 0.18) ? 1 : 0,
    Math.round(cl(optNum(a.pattern) ?? Math.floor(R() * 3), 0, 2)),
    (optBool(a.crest) ?? R() < 0.2) ? 1 : 0,
  ];
}

// ---- 常量表（本地中文映射；来自引擎注释口径） ----
const SEASONS = ['春', '夏', '秋', '冬'];
const DTYPE_NAME = ['动能', '热能', '定向能', '生化', '奇点'];
const DELIVERY_NAME = ['身管火炮', '光束', '蜂群', '轨道', '力场'];
const WAR_REASONS: readonly CasusKind[] = ['border', 'conquest', 'plunder', 'revenge', 'annex', 'unify', 'holy', 'alliance'];
const DIRECTIVES: readonly DirectiveKind[] = [
  'annihilate', 'conquer', 'expand', 'wealth', 'wisdom', 'populate', 'legion', 'build', 'unify', 'mobilize', 'alliance', 'temple',
];
const FX_KINDS: readonly Effect['kind'][] = ['explosion', 'bolt', 'skull', 'heart', 'smoke', 'hit'];
const ACH_BY_ID = new Map(ACHIEVEMENTS.map((x) => [x.id, x]));

// ---- 小工具 ----
function mustUnit(eng: GameEngine, id: number): Unit {
  const u = eng.units.find((v) => v.id === id && !v.dead);
  if (!u) throw new Error(`没有 id=${id} 的在世单位（用 find_units/get_units 检索）`);
  return u;
}
function unitBrief(eng: GameEngine, u: Unit) {
  return {
    id: u.id,
    name: u.name,
    race: RACES[u.race]?.name ?? '?',
    kingdom: u.civ >= 0 ? eng.civs[u.civ]?.name ?? null : '野外',
    hp: `${Math.ceil(u.hp)}/${u.maxHp}`,
    x: Math.round(u.x), y: Math.round(u.y),
    job: u.job != null ? JOBS[u.job]?.name ?? u.job : null,
    family: u.fam != null ? eng.families.get(u.fam)?.name ?? null : null,
  };
}
/** 王国名解析：alive 且全等或包含；失败报现存列国前 8 名 */
function mustCiv(eng: GameEngine, q: string): Civ {
  const key = q.trim();
  if (!key) throw new Error('缺少王国名参数');
  const c = eng.civs.find((x) => x.alive && x.name === key) ?? eng.civs.find((x) => x.alive && x.name.includes(key));
  if (!c) {
    const alive = eng.civs.filter((x) => x.alive).slice(0, 8).map((x) => x.name);
    throw new Error(`没有名为「${key}」的王国${alive.length ? `（现存：${alive.join('、')}）` : '（世上尚无王国）'}`);
  }
  return c;
}
/** 种群清点：race → 在世数量 */
function popByRace(eng: GameEngine): Map<number, number> {
  const m = new Map<number, number>();
  for (const u of eng.units) {
    if (u.dead) continue;
    m.set(u.race, (m.get(u.race) ?? 0) + 1);
  }
  return m;
}

/** 扩展工具执行器（bridge.ts default 分支委托；副作用 + 紧凑回执；参数问题 throw 中文错误） */
export function runExt(eng: GameEngine, name: string, a: Record<string, unknown>): unknown {
  switch (name) {
    // ================= L0 世界内核 =================
    case 'get_stats': {
      // 口径与机制条件 DSL（agentLaws.statValue）严格一致：模型读到的数 = 条件判定用的数
      let pop = 0;
      let wildlife = 0;
      let herb = 0;
      let pred = 0;
      let panicking = 0;
      let feuds = 0;
      for (const u of eng.units) {
        if (u.dead) continue;
        const d = RACES[u.race];
        if (!d) continue;
        if (d.isCiv) pop++;
        else wildlife++;
        if (eng.isHerbivoreRace(u.race)) herb++;
        if (d.predator) pred++;
        if ((u.panic ?? 0) >= 0.5) panicking++;
        feuds += u.gIds?.length ?? 0;
      }
      const deep = eng.worldsim.deepSnapshot();
      // 机制 v2 自定义计数器（counter:名 条件的数据源；防御式读取，缺省为空）
      const counters = (eng.agentLaws as unknown as { counters?: Record<string, number> }).counters ?? {};
      return {
        year: Math.floor(eng.yearF),
        pop, wildlife, herbivores: herb, predators: pred,
        kingdoms: eng.civs.filter((c) => c.alive).length,
        wars: eng.warData.size,
        panicking, feuds,
        families: eng.families.size,
        globalTemp: deep.globalTemp, seaLevel: deep.seaLevel,
        glacierArea: deep.glacierArea, soilAvg: deep.soilAvg,
        wildRaces: eng.dynRaces.size,
        fires: eng.fireSet.size,
        counters,
      };
    }

    case 'get_chronicle': {
      const limit = Math.round(clamp(num(a.limit, 20), 1, 60));
      const q = str(a.query).trim();
      const kind = str(a.kind).trim();
      const since = a.sinceYear == null ? null : Math.round(num(a.sinceYear, 0));
      const out: unknown[] = [];
      for (let i = eng.worldEvents.length - 1; i >= 0 && out.length < limit; i--) {
        const e = eng.worldEvents[i];
        if (kind && e.kind !== kind) continue;
        if (since !== null && e.year < since) continue;
        if (q && !e.text.includes(q)) continue;
        out.push({ year: e.year, kind: e.kind, text: e.text, at: e.x != null ? [e.x, e.y] : null });
      }
      return { matched: out.length, total: eng.worldEvents.length, events: out };
    }

    case 'era_control': {
      const action = str(a.action).trim();
      if (action === 'modernize') return { action, grantedTechs: eng.devModernize() };
      if (action === 'transcend') return { action, grantedTechs: eng.devTranscend() };
      if (action === 'next_season') {
        const s = eng.devNextSeason();
        return { action, season: SEASONS[s] ?? s };
      }
      throw new Error('action 只支持 modernize/transcend/next_season');
    }

    // ================= L1 生命单位 =================
    case 'get_unit_brain': {
      const id = Math.round(num(a.id, -1));
      const u = eng.units.find((v) => v.id === id && !v.dead);
      if (!u) throw new Error(`没有 id=${id} 的在世单位`);
      const neuro = eng.neuroInfo();
      return {
        unit: unitBrief(eng, u),
        attrs: { hp: `${Math.ceil(u.hp)}/${u.maxHp}`, dmg: r2(u.dmg), speed: r2(u.speed), kills: u.kills, age: Math.floor(u.age), maxAge: u.maxAge, trait: u.trait ?? null, bless: u.bless ?? null, curse: u.curse ?? null },
        neuroState: {
          panic: u.panic != null ? r2(u.panic) : null,
          fleeCooldown: u.fleeT ?? 0,
          chill: u.chill ?? 0,
          detour: u.detour ?? 0,
          loveFert: u.fert ?? 0,
          army: u.army ?? null,
          boat: !!u.boat,
        },
        gene: u.gene ? { speed: r2(u.gene.s), dmg: r2(u.gene.d), hp: r2(u.gene.h), repro: r2(u.gene.r) } : null,
        grudges: (u.gIds ?? []).map((gid, i) => {
          const t = eng.units.find((v) => v.id === gid);
          return { id: gid, name: t?.name ?? '（已亡故）', hate: r2(u.gVal?.[i] ?? 0) };
        }),
        family: u.fam != null ? { name: eng.families.get(u.fam)?.name ?? '?', gen: u.fgn ?? 0 } : null,
        neuroCore: {
          enabled: neuro.enabled,
          flightMode: neuro.flightMode,
          totalParams: neuro.totalParams,
          heads: neuro.heads.map((h) => ({ key: h.key, name: h.name, arch: h.arch, params: h.params, calls: h.calls, usPerCall: r2(h.usPerCall) })),
          flightRL: { divWinRate: r2(neuro.flightRL.divWinRate * 100), rlSurvival: r2(neuro.flightRL.rlSurvival) },
        },
      };
    }

    case 'get_races': {
      const pop = popByRace(eng);
      const races = Object.entries(RACES).map(([idStr, d]) => {
        const id = Number(idStr);
        return {
          id, name: d.name, key: d.key,
          civ: d.isCiv ? 1 : 0, predator: d.predator ? 1 : 0,
          pop: pop.get(id) ?? 0,
          gen: eng.speciesBase.get(id)?.gen ?? 0,
        };
      });
      // 种族关系摘要：偏离基线（RACE_REL_BASE）且双方都存活的种族对，按 |值| 降序前 20
      const alive = [...pop.keys()];
      const pairs: { a: string; b: string; v: number }[] = [];
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const lo = Math.min(alive[i], alive[j]);
          const hi = Math.max(alive[i], alive[j]);
          const cur = eng.raceRelOf(lo, hi);
          const base = RACE_REL_BASE[`${lo}-${hi}`] ?? 0;
          if (cur !== base) pairs.push({ a: RACES[lo]?.name ?? lo, b: RACES[hi]?.name ?? hi, v: Math.round(cur) });
        }
      }
      pairs.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
      return { count: races.length, races, relations: pairs.slice(0, 20), extinctPreset: races.filter((x) => x.pop === 0 && !eng.dynRaces.has(x.id)).length };
    }

    case 'get_evo': {
      const g = eng.getEvoGraph();
      const nodes = (g.nodes.length > 40 ? g.nodes.slice(-40) : g.nodes).map((n) => ({
        kind: n.kind, name: n.name, year: n.year, alive: n.alive, detail: n.detail.slice(0, 80),
      }));
      const pop = popByRace(eng);
      const dyn = [...eng.dynRaces.entries()].map(([id, info]) => ({
        id, name: RACES[id]?.name ?? `物种#${id}`, pop: pop.get(id) ?? 0, bornYear: info.bornYear, gen: eng.speciesBase.get(id)?.gen ?? 0,
      })).sort((x, y) => y.pop - x.pop);
      const weapons = [...eng.emergentWeapons.values()].sort((x, y) => y.dmg - x.dmg).slice(0, 12).map((w) => ({
        name: w.name, civ: eng.civs[w.civ]?.name ?? '?', gen: w.gen, dmg: Math.round(w.dmg), kills: w.kills, wonder: w.wonder, retired: w.retired,
      }));
      return { counts: g.counts, dynSpecies: g.dynSpecies, dynWeapons: g.dynWeapons, emTechs: g.emTechs, dynTraits: g.dynTraits, emIdeas: g.emIdeas, year: g.year, recentNodes: nodes, dynRaces: dyn, topWeapons: weapons };
    }

    case 'find_units': {
      const q = str(a.name).trim();
      if (!q) throw new Error('缺少参数 name');
      const limit = Math.round(clamp(num(a.limit, 15), 1, 40));
      const out: unknown[] = [];
      for (const u of eng.units) {
        if (u.dead) continue;
        if (!u.name.includes(q)) continue;
        out.push(unitBrief(eng, u));
        if (out.length >= limit) break;
      }
      return { matched: out.length, units: out };
    }

    case 'search_units': {
      const limit = Math.round(clamp(num(a.limit, 15), 1, 40));
      const raceQ = str(a.race).trim();
      const civQ = str(a.kingdom).trim();
      const minKills = a.minKills == null ? null : num(a.minKills, 0);
      const minHp = a.minHp == null ? null : num(a.minHp, 0);
      const maxHp = a.maxHp == null ? null : num(a.maxHp, Number.MAX_SAFE_INTEGER);
      const hasNear = a.nearX != null && a.nearY != null;
      const nx = num(a.nearX, 0);
      const ny = num(a.nearY, 0);
      const nr = Math.round(clamp(num(a.nearR, 10), 1, 60));
      const nr2 = nr * nr;
      const raceId = raceQ ? resolveRace(raceQ) : null;
      if (raceQ && raceId === null) throw new Error(`未知种族「${raceQ}」`);
      let civId = -2;
      if (civQ) {
        const c = eng.civs.find((x) => x.alive && (x.name === civQ || x.name.includes(civQ)));
        if (!c) throw new Error(`没有名为「${civQ}」的王国`);
        civId = c.id;
      }
      const out: unknown[] = [];
      for (const u of eng.units) {
        if (u.dead) continue;
        if (raceId !== null && u.race !== raceId) continue;
        if (civId !== -2 && u.civ !== civId) continue;
        if (minKills !== null && u.kills < minKills) continue;
        if (minHp !== null && u.hp < minHp) continue;
        if (maxHp !== null && u.hp > maxHp) continue;
        if (hasNear && (u.x - nx) ** 2 + (u.y - ny) ** 2 > nr2) continue;
        out.push({ ...unitBrief(eng, u), kills: u.kills, age: Math.floor(u.age) });
        if (out.length >= limit) break;
      }
      return { matched: out.length, units: out };
    }

    case 'set_unit_attr': {
      const id = Math.round(num(a.id, -1));
      const u = mustUnit(eng, id);
      const changes: string[] = [];
      const chg = (k: string, before: unknown, after: unknown) => changes.push(`${k}: ${String(before)} → ${String(after)}`);
      if (a.name != null) {
        const nm = str(a.name).trim().slice(0, 12);
        if (!nm) throw new Error('name 不能为空');
        chg('name', u.name, nm);
        u.name = nm;
      }
      if (a.maxHp != null) {
        const v = Math.round(clamp(num(a.maxHp, u.maxHp), 1, 99999));
        chg('maxHp', u.maxHp, v);
        u.maxHp = v;
        u.hp = Math.max(1, Math.min(u.hp, u.maxHp * 5));
      }
      if (a.hp != null) {
        const v = Math.round(clamp(num(a.hp, u.hp), 1, u.maxHp * 5));
        chg('hp', Math.ceil(u.hp), v);
        u.hp = v;
      }
      if (a.dmg != null) {
        const v = r2(clamp(num(a.dmg, u.dmg), 0, 500));
        chg('dmg', r2(u.dmg), v);
        u.dmg = v;
      }
      if (a.speed != null) {
        const v = r2(clamp(num(a.speed, u.speed), 0.1, 8));
        chg('speed', r2(u.speed), v);
        u.speed = v;
      }
      if (a.kills != null) {
        const v = Math.round(clamp(num(a.kills, u.kills), 0, 9999));
        chg('kills', u.kills, v);
        u.kills = v;
      }
      if (a.age != null) {
        const v = r2(clamp(num(a.age, u.age), 0, u.maxAge));
        chg('age', Math.floor(u.age), v);
        u.age = v;
      }
      if (a.civ != null) {
        let cid: number;
        if (typeof a.civ === 'number' && Number.isFinite(a.civ)) {
          cid = Math.round(a.civ);
          if (cid !== -1 && !(eng.civs[cid]?.alive)) throw new Error(`没有 id=${cid} 的在世王国`);
        } else {
          const q = str(a.civ).trim();
          if (q === '-1' || q === '') {
            cid = -1;
          } else {
            const c = eng.civs.find((x) => x.alive && (x.name === q || x.name.includes(q)));
            if (!c) throw new Error(`没有名为「${q}」的王国（-1 = 逐出为野生）`);
            cid = c.id;
          }
        }
        chg('civ', u.civ >= 0 ? eng.civs[u.civ]?.name ?? u.civ : '野外', cid >= 0 ? eng.civs[cid]?.name ?? cid : '野外');
        u.civ = cid;
      }
      if (a.x != null || a.y != null) {
        const ox = Math.round(u.x);
        const oy = Math.round(u.y);
        const nx = a.x != null ? Math.round(clamp(num(a.x, u.x), 0, W - 1)) : ox;
        const ny = a.y != null ? Math.round(clamp(num(a.y, u.y), 0, H - 1)) : oy;
        u.x = nx; u.y = ny; u.tx = nx; u.ty = ny; u.boat = 0;
        chg('pos', `(${ox},${oy})`, `(${nx},${ny})`);
      }
      if (a.job != null) {
        const v = Math.round(clamp(num(a.job, 0), 0, JOBS.length - 1));
        chg('job', u.job != null ? JOBS[u.job]?.name ?? u.job : '平民', JOBS[v]?.name ?? v);
        u.job = v;
      }
      if (changes.length === 0) throw new Error('没有给出任何要修改的字段（name/hp/maxHp/dmg/speed/kills/age/civ/x/y/job）');
      return { id: u.id, name: u.name, changes };
    }

    case 'teleport_unit': {
      const id = Math.round(num(a.id, -1));
      const u = mustUnit(eng, id);
      const x = Math.round(clamp(num(a.x, -1), 0, W - 1));
      const y = Math.round(clamp(num(a.y, -1), 0, H - 1));
      const from = [Math.round(u.x), Math.round(u.y)];
      u.x = x; u.y = y; u.tx = x; u.ty = y; u.boat = 0;
      return { id: u.id, name: u.name, from, to: [x, y] };
    }

    case 'kill_units': {
      let n = 0;
      // v3：ids 宽松归一——单个数字/逗号分隔字符串 → 数组（防误入无过滤全杀路径）
      if (a.ids != null && !Array.isArray(a.ids)) {
        const raw = String(a.ids).trim();
        const arr = raw
          .split(/[,，\s;；]+/)
          .map((s) => Number(s.trim()))
          .filter((v) => Number.isFinite(v));
        if (arr.length === 0) throw new Error(`ids 无法解析为 id 数组（收到：${raw.slice(0, 60)}）`);
        a = { ...a, ids: arr };
      }
      if (Array.isArray(a.ids)) {
        const cap = 200;
        const ids = new Set<number>();
        for (const v of a.ids) {
          const id = Number(v);
          if (Number.isFinite(id)) ids.add(Math.round(id));
        }
        for (const u of eng.units) {
          if (u.dead || !ids.has(u.id)) continue;
          u.hp = 0;
          n++;
          if (n >= cap) break;
        }
        return { executed: n, by: 'ids' };
      }
      const cap = Math.round(clamp(num(a.limit, 50), 1, 200));
      const raceQ = str(a.race).trim();
      const civQ = str(a.kingdom).trim();
      const raceId = raceQ ? resolveRace(raceQ) : null;
      if (raceQ && raceId === null) throw new Error(`未知种族「${raceQ}」`);
      let civId = -2;
      if (civQ) {
        const c = eng.civs.find((x) => x.alive && (x.name === civQ || x.name.includes(civQ)));
        if (!c) throw new Error(`没有名为「${civQ}」的王国`);
        civId = c.id;
      }
      const hasXY = a.x != null && a.y != null;
      const cx = num(a.x, 0);
      const cy = num(a.y, 0);
      const rr = Math.round(clamp(num(a.radius, 10), 1, 40));
      const rr2 = rr * rr;
      let matched = 0;
      for (const u of eng.units) {
        if (u.dead) continue;
        if (raceId !== null && u.race !== raceId) continue;
        if (civId !== -2 && u.civ !== civId) continue;
        if (hasXY && (u.x - cx) ** 2 + (u.y - cy) ** 2 > rr2) continue;
        matched++;
        if (n >= cap) continue;
        u.hp = 0;
        n++;
      }
      return { executed: n, matched, cap };
    }

    case 'heal_area': {
      const x = Math.round(clamp(num(a.x, -1), 0, W - 1));
      const y = Math.round(clamp(num(a.y, -1), 0, H - 1));
      const radius = Math.round(clamp(num(a.radius, 5), 1, 20));
      eng.healArea(x, y, radius);
      return { healed: true, at: [x, y], radius };
    }

    case 'gene_control': {
      const action = str(a.action).trim();
      if (action === 'jump' || action === 'reroll_trait') {
        const u = mustUnit(eng, Math.round(num(a.id, -1)));
        if (action === 'jump') {
          const amount = r2(clamp(num(a.amount, 1), 0.1, 3));
          const before = u.gene ? { s: r2(u.gene.s), d: r2(u.gene.d), h: r2(u.gene.h), r: r2(u.gene.r) } : null;
          eng.jumpGene(u, amount);
          const after = u.gene ? { s: r2(u.gene.s), d: r2(u.gene.d), h: r2(u.gene.h), r: r2(u.gene.r) } : null;
          return { id: u.id, name: u.name, amount, geneBefore: before, geneAfter: after, attrsNow: { hp: `${Math.ceil(u.hp)}/${u.maxHp}`, dmg: r2(u.dmg), speed: r2(u.speed) } };
        }
        const oldT = u.trait ?? null;
        eng.rerollTrait(u);
        return { id: u.id, name: u.name, traitBefore: oldT, traitAfter: u.trait ?? null, attrsNow: { hp: `${Math.ceil(u.hp)}/${u.maxHp}`, dmg: r2(u.dmg), speed: r2(u.speed) } };
      }
      if (action === 'mutate_area') {
        const x = Math.round(clamp(num(a.x, rndX()), 0, W - 1));
        const y = Math.round(clamp(num(a.y, rndY()), 0, H - 1));
        const radius = Math.round(clamp(num(a.radius, 5), 1, 12));
        eng.mutateArea(x, y, radius);
        return { mutated: true, at: [x, y], radius };
      }
      throw new Error('action 只支持 jump/reroll_trait/mutate_area');
    }

    case 'spawn_species': {
      // v5 全新创造协议：属性/外貌/生态角色全部显式设计（非模板克隆）。
      // 旧参数 base 兼容为体形族系提示（form 别名）；power 已废弃（用 hp/dmg/speed 直定）。
      const count = Math.round(clamp(num(a.count, 6), 1, 40));
      const name = str(a.name).trim().slice(0, 8) || undefined;
      const hasXY = typeof a.x === 'number' && typeof a.y === 'number';
      // 缺省落点 = 相机中心（造物主看得见降临）
      const x = Math.round(clamp(num(a.x, camX(eng)), 0, W - 1));
      const y = Math.round(clamp(num(a.y, camY(eng)), 0, H - 1));
      const formQ = (str(a.form).trim() || str(a.base).trim()).toLowerCase();
      const form = (FORM_KEYS as readonly string[]).includes(formQ) ? formQ : undefined;
      const vis: Partial<Record<string, number | boolean>> = {};
      for (const k of ['hue', 'lum', 'size', 'bulk', 'horns', 'tail', 'ears', 'pattern'] as const) {
        const v = optNum(a[k]);
        if (v !== undefined) vis[k] = v;
      }
      for (const k of ['spikes', 'mane', 'glow', 'crest'] as const) {
        const v = optBool(a[k]);
        if (v !== undefined) vis[k] = v;
      }
      const res = eng.spawnCustomSpecies({
        name, count,
        x: hasXY ? x : undefined, y: hasXY ? y : undefined,
        wild: a.wild === undefined ? undefined : bool(a.wild, true),
        predator: optBool(a.predator),
        hostile: optBool(a.hostile),
        hp: optNum(a.hp), dmg: optNum(a.dmg), speed: optNum(a.speed), repro: optNum(a.repro), maxAge: optNum(a.maxAge), cap: optNum(a.cap),
        form, archetype: str(a.archetype).trim().slice(0, 24) || undefined,
        vis: Object.keys(vis).length > 0 ? (vis as never) : undefined,
      });
      if (!res) throw new Error('创造失败（物种注册表已满 64 上限）——先让一些物种灭绝再试');
      const def = RACES[res.id];
      return {
        created: true,
        species: {
          id: res.id, name: res.name, form: res.form,
          wild: def?.isCiv !== true, hp: def?.hp, dmg: def?.dmg, speed: def?.speed, maxAge: def?.maxAge,
          predator: !!def?.predator, hostile: !!def?.hostile, archetype: def?.archetype ?? null,
        },
        spawned: res.spawned,
        at: res.at,
        note: '全新物种（无模板血统）：独立基因池与视觉基因组，可种化/融合演化（get_evo 查谱系）；save_creation 可永久入图鉴',
      };
    }

    case 'hybridize_species': {
      const qA = str(a.raceA).trim();
      const qB = str(a.raceB).trim();
      if (!qA || !qB) throw new Error('缺少参数 raceA/raceB（物种名）');
      const ra = resolveRace(qA);
      const rb = resolveRace(qB);
      if (ra === null) throw new Error(`未知物种「${qA}」（get_races 查看全部物种）`);
      if (rb === null) throw new Error(`未知物种「${qB}」（get_races 查看全部物种）`);
      if (ra === rb) throw new Error('同一物种无法与自身融合');
      const pop = popByRace(eng);
      const popA = pop.get(ra) ?? 0;
      const popB = pop.get(rb) ?? 0;
      if (popA < 8 || popB < 8) throw new Error(`种群不足（「${RACES[ra]?.name}」${popA} 只 / 「${RACES[rb]?.name}」${popB} 只，双方各需 ≥8）`);
      const res = eng.forceHybridize(ra, rb);
      if (!res) throw new Error('融合失败（物种注册表已满 / 3 代内血亲 / 冷却中）');
      const def = RACES[res.id];
      return {
        fused: true,
        newSpecies: { id: res.id, name: res.name, hp: def?.hp, dmg: def?.dmg, speed: def?.speed, predator: !!def?.predator },
        parents: [RACES[ra]?.name ?? ra, RACES[rb]?.name ?? rb],
        converted: res.converted,
        note: '杂种优势 +8%，视觉基因组已混合（色相中点/附器并集）——get_evo 可见双亲谱系边；想永久收藏就 save_creation',
      };
    }

    // ================= L1+ 造物图鉴（永久图书馆 CRUD） =================
    case 'save_creation': {
      const kind = str(a.kind).trim();
      const name = str(a.name).trim().slice(0, 8);
      if (!kind || !['species', 'weapon', 'item'].includes(kind)) throw new Error('kind 只能是 species/weapon/item');
      if (!name) throw new Error('缺少参数 name（≤8 字）');
      const pin = bool(a.pin, true);
      const note = str(a.note).trim().slice(0, 40) || undefined;
      if (kind === 'species') {
        // 路径一：race 参数 → 收藏世界内现存种族（含刚造的）的全部属性与外貌
        const raceQ = str(a.race).trim();
        if (raceQ) {
          const rid = resolveRace(raceQ);
          if (rid === null) throw new Error(`未知种族「${raceQ}」（get_races 查看）`);
          const entry = eng.saveRaceToCreation(rid, { pin, note });
          if (!entry) throw new Error('收藏失败（图鉴已满 128 条且全部固定）——先 delete_creation 腾位');
          const d = RACES[rid];
          return {
            saved: true, uid: entry.uid, kind,
            entry: { name: entry.name, hp: d?.hp, dmg: d?.dmg, speed: d?.speed, repro: d?.repro, maxAge: d?.maxAge, wild: !d?.isCiv },
            pinned: pin,
            note: pin ? '已永久铭刻图鉴并显示在放置面板（生物页/动物页可删除）' : '已永久铭刻图鉴（不在放置面板显示，edit_creation pin=true 可上板）',
          };
        }
        // 路径二：从零定义全新物种（v5 非模板：属性/外貌/生态角色全自定；缺省 = 角色基线而非模板值）
        const formQ = (str(a.form).trim() || str(a.base).trim()).toLowerCase();
        const wild = a.wild === undefined ? true : bool(a.wild, true);
        const predator = optBool(a.predator) ?? false;
        const eco = !wild ? 'civ' : predator ? 'pred' : (optNum(a.dmg) != null && optNum(a.dmg)! <= 3 ? 'herb' : 'neutral');
        const eb = ECO_STATS[eco];
        // 体形族系：显式指定 → 用之；否则按角色随机（不继承任何模板属性）
        const FORM_POOL: Record<string, string[]> = {
          pred: ['wolf', 'bear', 'snake', 'scorpion', 'snowwolf', 'ogre', 'troll', 'basilisk', 'dragon'],
          herb: ['sheep', 'deer', 'penguin', 'camel'],
          neutral: ['person', 'mage', 'skeleton', 'vampire', 'whitewalker'],
          civ: ['person'],
        };
        const form = (FORM_KEYS as readonly string[]).includes(formQ) ? formQ : FORM_POOL[eco][Math.floor(Math.random() * FORM_POOL[eco].length)];
        const fb = FORM_BASE[form];
        const entry = addCreation({
          kind: 'species', name,
          baseKey: fb.key, baseName: fb.name,
          form,
          wild, predator,
          hostile: optBool(a.hostile) ?? (predator && Math.random() < 0.5),
          cap: Math.round(clamp(optNum(a.cap) ?? eb.cap, 4, 400)) || undefined,
          archetype: str(a.archetype).trim().slice(0, 24) || undefined,
          hp: Math.round(clamp(num(a.hp, eb.hp), 1, 99999)),
          dmg: r2(clamp(num(a.dmg, eb.dmg), 0, 500)),
          speed: Math.round(clamp(num(a.speed, eb.speed), 0.005, 0.3) * 1000) / 1000,
          repro: Math.round(clamp(num(a.repro, eb.repro), 0, 0.02) * 10000) / 10000,
          maxAge: Math.round(clamp(num(a.maxAge, eb.maxAge), 1, 9999)),
          visT: buildVisT(a),
          tintIdx: listCreations().length % 8,
          power: 1, pinned: pin, createdBy: 'oracle', note,
        } as Omit<SpeciesCreation, 'uid' | 'createdAt'>);
        if (!entry) throw new Error('收藏失败（图鉴已满且全部固定）');
        return { saved: true, uid: entry.uid, kind, entry: { name, form, hp: entry.hp, dmg: entry.dmg, speed: entry.speed, wild: entry.wild, predator: entry.predator }, pinned: pin, note: '全新物种已永久入库（无模板血统）；下次 save_creation/放置面板可随时取出' };
      }
      if (kind === 'weapon') {
        const entry = addCreation({
          kind: 'weapon', name,
          payload: Math.round(clamp(num(a.payload, 5), 0, 6)),
          delivery: Math.round(clamp(num(a.delivery, 4), 0, 4)),
          guide: Math.round(clamp(num(a.guide, 4), 0, 4)),
          powerSlot: Math.round(clamp(num(a.powerSlot, 4), 0, 4)),
          boost: r2(clamp(num(a.boost, 1.6), 0.5, 3)),
          pinned: pin, createdBy: 'oracle', note,
        } as Omit<WeaponCreation, 'uid' | 'createdAt'>);
        if (!entry) throw new Error('收藏失败（图鉴已满且全部固定）');
        return { saved: true, uid: entry.uid, kind, entry: { name, boost: entry.boost }, pinned: pin, note: '武器模板已永久收藏；配合工坊可铸造到任意世界的王国' };
      }
      // item
      const slot = str(a.slot, 'wep').trim();
      const SLOTS = ['wep', 'arm', 'hlm', 'shd', 'bts', 'rng', 'amu'];
      if (!SLOTS.includes(slot)) throw new Error(`slot 只能是 ${SLOTS.join('/')}`);
      const stats = (a.stats && typeof a.stats === 'object' ? a.stats : {}) as Record<string, unknown>;
      const clean: Record<string, number> = {};
      for (const k of ['dmg', 'hp', 'speedMul', 'regen', 'armor', 'crit', 'lifesteal', 'thorns', 'ranged']) {
        if (typeof stats[k] === 'number' && Number.isFinite(stats[k] as number)) clean[k] = stats[k] as number;
      }
      const entry = addCreation({
        kind: 'item', name, slot: slot as ItemCreation['slot'],
        rarity: Math.round(clamp(num(a.rarity, 3), 0, 4)),
        art: slot === 'wep' ? 'sword' : slot === 'arm' ? 'armor2' : slot === 'hlm' ? 'iron_helm' : slot === 'shd' ? 'iron_shield' : slot === 'bts' ? 'leather_boots' : slot === 'rng' ? 'ring' : 'holy_symbol',
        stats: clean, desc: str(a.desc).trim().slice(0, 40) || '神谕亲手锻造的神物',
        pinned: pin, createdBy: 'oracle', note,
      } as Omit<ItemCreation, 'uid' | 'createdAt'>);
      if (!entry) throw new Error('收藏失败（图鉴已满且全部固定）');
      return { saved: true, uid: entry.uid, kind, entry: { name, slot, rarity: entry.rarity, stats: clean }, pinned: pin, note: pin ? '神物已入库并显示在宝物页（可放置/可删除）' : '神物已入库' };
    }

    case 'list_creations': {
      const list = listCreations();
      return {
        total: list.length,
        cap: 128,
        creations: list.map((e) => ({ uid: e.uid, kind: e.kind, name: e.name, pinned: e.pinned, by: e.createdBy, brief: describeCreation(e) })),
      };
    }

    case 'edit_creation': {
      const q = str(a.uid).trim();
      if (!q) throw new Error('缺少参数 uid（或名称，见 list_creations）');
      const entry = getCreation(q);
      if (!entry) throw new Error(`图鉴中没有「${q}」（list_creations 查看）`);
      const patch: Partial<Omit<SpeciesCreation, 'kind'>> & Partial<Omit<WeaponCreation, 'kind'>> & Partial<Omit<ItemCreation, 'kind'>> = {};
      const name = str(a.name).trim().slice(0, 8);
      if (name) patch.name = name;
      if (typeof a.pin === 'boolean') patch.pinned = a.pin;
      const note = str(a.note).trim().slice(0, 40);
      if (note) patch.note = note;
      if (entry.kind === 'species') {
        if (typeof a.hp === 'number') patch.hp = Math.round(clamp(a.hp, 1, 99999));
        if (typeof a.dmg === 'number') patch.dmg = r2(clamp(a.dmg, 0, 500));
        if (typeof a.speed === 'number') patch.speed = Math.round(clamp(a.speed, 0.005, 0.3) * 1000) / 1000;
        if (typeof a.repro === 'number') patch.repro = Math.round(clamp(a.repro, 0, 0.02) * 10000) / 10000;
        if (typeof a.maxAge === 'number') patch.maxAge = Math.round(clamp(a.maxAge, 1, 9999));
        if (typeof a.wild === 'boolean') patch.wild = a.wild;
        // v5 全新造物元数据：体形族系/生态角色/上限/原型 + 外貌重掷
        const formQ = str(a.form).trim().toLowerCase();
        if (formQ && (FORM_KEYS as readonly string[]).includes(formQ)) {
          patch.form = formQ;
          const fb = FORM_BASE[formQ];
          patch.baseKey = fb.key;
          patch.baseName = fb.name;
        }
        if (typeof a.predator === 'boolean') patch.predator = a.predator;
        if (typeof a.hostile === 'boolean') patch.hostile = a.hostile;
        if (typeof a.cap === 'number') patch.cap = Math.round(clamp(a.cap, 4, 400));
        const arch = str(a.archetype).trim().slice(0, 24);
        if (arch) patch.archetype = arch;
        if (a.rerollVis === true || a.rerollVis === 1) patch.visT = buildVisT({});
      } else if (entry.kind === 'weapon') {
        if (typeof a.boost === 'number') patch.boost = r2(clamp(a.boost, 0.5, 3));
      } else {
        if (typeof a.rarity === 'number') patch.rarity = Math.round(clamp(a.rarity, 0, 4));
        if (a.stats && typeof a.stats === 'object') {
          const st = a.stats as Record<string, unknown>;
          const clean: Record<string, number> = {};
          for (const k of ['dmg', 'hp', 'speedMul', 'regen', 'armor', 'crit', 'lifesteal', 'thorns', 'ranged']) {
            if (typeof st[k] === 'number' && Number.isFinite(st[k] as number)) clean[k] = st[k] as number;
          }
          patch.stats = clean;
        }
      }
      const next = patchCreation(entry.uid, patch);
      if (!next) throw new Error('编辑失败（图鉴写入失败）');
      // 物种已在本世界降临 → 同步改写活体（属性 + 现存个体）
      const rid = eng.creationRaceIds.get(entry.uid);
      let liveSync = false;
      if (rid !== undefined && RACES[rid] && next.kind === 'species') {
        eng.editRaceDef(rid, { name: next.name, hp: next.hp, dmg: next.dmg, speed: next.speed, repro: next.repro, maxAge: next.maxAge, isCiv: !next.wild });
        liveSync = true;
      }
      if (next.kind === 'item') hydrateOneItem(next);
      return { edited: true, uid: next.uid, brief: describeCreation(next), liveSync, note: liveSync ? '图鉴已更新，且本世界活体已同步改写' : '图鉴已更新' };
    }

    case 'delete_creation': {
      const q = str(a.uid).trim();
      if (!q) throw new Error('缺少参数 uid');
      const entry = getCreation(q);
      if (!entry) throw new Error(`图鉴中没有「${q}」`);
      const brief = describeCreation(entry);
      const ok = removeCreation(entry.uid);
      if (!ok) throw new Error('删除失败（图鉴写入失败）');
      return { deleted: true, uid: entry.uid, brief, note: '已从图鉴与放置面板永久移除（本世界已降临的活体不受影响）' };
    }

    case 'edit_race': {
      const raceQ = str(a.race).trim();
      if (!raceQ) throw new Error('缺少参数 race（种族名）');
      const rid = resolveRace(raceQ);
      if (rid === null) throw new Error(`未知种族「${raceQ}」（get_races 查看）`);
      const d0 = RACES[rid];
      const before = { name: d0?.name, hp: d0?.hp, dmg: d0?.dmg, speed: d0?.speed, maxAge: d0?.maxAge };
      const patch: Parameters<GameEngine['editRaceDef']>[1] = {};
      const name = str(a.name).trim().slice(0, 8);
      if (name) patch.name = name;
      if (typeof a.hp === 'number') patch.hp = clamp(a.hp, 1, 99999);
      if (typeof a.dmg === 'number') patch.dmg = clamp(a.dmg, 0, 500);
      if (typeof a.speed === 'number') patch.speed = clamp(a.speed, 0.005, 0.3);
      if (typeof a.repro === 'number') patch.repro = clamp(a.repro, 0, 0.02);
      if (typeof a.maxAge === 'number') patch.maxAge = clamp(a.maxAge, 1, 9999);
      if (typeof a.wild === 'boolean') patch.isCiv = !a.wild;
      if (typeof a.hostile === 'boolean') patch.hostile = a.hostile;
      if (typeof a.rerollVis === 'number') patch.rerollVis = clamp(a.rerollVis, 0.2, 3);
      if (Object.keys(patch).length === 0) throw new Error('没有给出任何要改的字段');
      const d = eng.editRaceDef(rid, patch);
      if (!d) throw new Error('改写失败（种族定义缺失）');
      return {
        edited: true,
        race: { id: rid, name: d.name, hp: d.hp, dmg: d.dmg, speed: d.speed, repro: d.repro, maxAge: d.maxAge, wild: !d.isCiv, hostile: d.hostile },
        before,
        note: '世界内改写并波及现存个体，随存档走；save_creation 可永久化入图鉴',
      };
    }

    case 'spawn_item': {
      const tier = str(a.tier, 'chest').trim();
      const TIERS: Record<string, string> = { chest: '宝箱', chest2: '秘银宝箱', chest3: '神话宝箱' };
      if (!(tier in TIERS)) throw new Error(`未知档位 ${tier}（可用：chest/chest2/chest3）`);
      const x = Math.round(clamp(num(a.x, camX(eng)), 0, W - 1));
      const y = Math.round(clamp(num(a.y, camY(eng)), 0, H - 1));
      const before = eng.items.length;
      eng.dropRandomItem(x, y, tier);
      const it = eng.items.length > before ? eng.items[eng.items.length - 1] : null;
      const def = it ? ITEM_DEFS[it.kind] : null;
      return {
        dropped: !!it,
        tier: `${TIERS[tier]}（${tier}）`,
        at: [x, y],
        item: it && def ? {
          kind: it.kind, name: def.name, slot: SLOT_NAMES[def.slot] ?? def.slot,
          rarity: RARITY_META[def.rarity]?.name ?? def.rarity,
          desc: def.desc,
        } : null,
      };
    }

    case 'cast_fx': {
      const kind = str(a.kind).trim();
      if (!FX_KINDS.includes(kind as Effect['kind'])) throw new Error(`未知特效 ${kind}（可用：${FX_KINDS.join('/')}）`);
      const x = clamp(num(a.x, camX(eng)), 0, W - 1);
      const y = clamp(num(a.y, camY(eng)), 0, H - 1);
      const ttl = Math.round(clamp(num(a.ttl, 90), 30, 600));
      eng.fx(kind as Effect['kind'], x, y, ttl);
      return { fx: kind, at: [Math.round(x), Math.round(y)], ttl };
    }

    // ================= L2 文明王国 =================
    case 'get_families': {
      const limit = Math.round(clamp(num(a.limit, 10), 1, 24));
      const maxGen = new Map<number, number>();
      for (const u of eng.units) {
        if (u.dead || u.fam == null) continue;
        if ((u.fgn ?? 0) > (maxGen.get(u.fam) ?? 0)) maxGen.set(u.fam, u.fgn ?? 0);
      }
      const fams = [...eng.families.values()]
        .sort((x, y) => y.members - x.members || y.kills - x.kills)
        .slice(0, limit)
        .map((f) => ({
          name: f.name, race: RACES[f.race]?.name ?? '?', founder: f.founder, founded: f.founded,
          members: f.members, kills: f.kills, heroes: f.heroes, peak: f.peak, maxGen: maxGen.get(f.id) ?? 0,
        }));
      return { total: eng.families.size, families: fams };
    }

    case 'get_history': {
      // 全局兴衰曲线：合并全部王国（含亡国）的 5 年采样点 → 年份/总人口/列国数
      const byYear = new Map<number, { pop: number; civs: number }>();
      for (const c of eng.civs) {
        for (const pt of c.history ?? []) {
          const y = pt[0];
          const p = pt[1];
          if (typeof y !== 'number' || typeof p !== 'number') continue;
          const e = byYear.get(y) ?? { pop: 0, civs: 0 };
          e.pop += p;
          e.civs += 1;
          byYear.set(y, e);
        }
      }
      let series = [...byYear.entries()].sort((x, y) => x[0] - y[0]).map(([year, e]) => ({ year, pop: e.pop, civs: e.civs }));
      if (series.length > 60) {
        const step = Math.ceil(series.length / 60);
        series = series.filter((_, i) => i % step === 0 || i === series.length - 1);
      }
      const civSummaries = eng.civs.filter((c) => c.alive).map((c) => ({
        name: c.name,
        points: (c.history ?? []).slice(-10).map((pt) => ({ year: pt[0], pop: pt[1], tiles: pt[2] ?? 0, houses: pt[3] ?? 0 })),
      }));
      return { samples: series.length, series, aliveCivs: civSummaries };
    }

    case 'get_achievements': {
      const unlocked = [...eng.achUnlocked.entries()]
        .sort((x, y) => x[1] - y[1])
        .map(([id, year]) => ({ id, name: ACH_BY_ID.get(id)?.name ?? id, year }));
      const progress = Object.entries(eng.achProgressCache).map(([id, v]) => ({
        id, name: ACH_BY_ID.get(id)?.name ?? id, value: r2(v), goal: ACH_BY_ID.get(id)?.goal ?? null,
      }));
      return { total: ACHIEVEMENTS.length, unlockedCount: unlocked.length, unlocked, inProgress: progress };
    }

    case 'get_weapon': {
      const c = mustCiv(eng, str(a.kingdom));
      const weapons = [...eng.emergentWeapons.values()]
        .filter((w) => w.civ === c.id)
        .sort((x, y) => y.dmg - x.dmg)
        .map((w) => ({
          name: w.name, gen: w.gen, dmg: Math.round(w.dmg), radius: w.radius,
          dtype: DTYPE_NAME[w.dtype] ?? `#${w.dtype}`, delivery: DELIVERY_NAME[w.delivery] ?? `#${w.delivery}`,
          kills: w.kills, fired: w.fired, wonder: w.wonder, retired: w.retired,
        }));
      return { kingdom: c.name, count: weapons.length, weapons };
    }

    case 'forge_divine_weapon': {
      const c = mustCiv(eng, str(a.kingdom));
      const name = str(a.name).trim().slice(0, 30) || undefined;
      const optN = (v: unknown): number | undefined => {
        const n = num(v, NaN);
        return Number.isFinite(n) ? Math.round(n) : undefined;
      };
      const w = eng.forgeDivineWeapon(c.id, {
        name,
        pl: optN(a.payload),
        dl: optN(a.delivery),
        gd: optN(a.guide),
        pw: optN(a.power),
        boost: num(a.boost, 1.6),
      });
      if (!w) throw new Error('神铸失败（武器注册表已满 128 上限）');
      return {
        forged: true,
        weapon: {
          name: w.name, kingdom: c.name, dmg: Math.round(w.dmg), radius: w.radius,
          dtype: DTYPE_NAME[w.dtype] ?? `#${w.dtype}`, delivery: DELIVERY_NAME[w.delivery] ?? `#${w.delivery}`,
          fire: w.fire, rad: w.rad, terra: w.terra, morale: w.morale, wonder: w.wonder,
        },
        note: '神铸武器免经费/免时代门槛，交战时自动开火（get_weapon 复查战绩）',
      };
    }

    case 'merge_kingdoms': {
      const qa = str(a.kingdomA).trim();
      const qb = str(a.kingdomB).trim();
      if (!qa || !qb) throw new Error('缺少参数 kingdomA/kingdomB');
      const ca = mustCiv(eng, qa);
      const cb = mustCiv(eng, qb);
      if (ca.id === cb.id) throw new Error('同一王国无法与自身合并');
      if (eng.atWar(ca.id, cb.id)) throw new Error(`「${ca.name}」与「${cb.name}」正处于战争状态——先 diplomacy_control 议和，再行合并`);
      const keep = eng.mergeCivs(ca, cb, 'oracle');
      if (!keep) throw new Error('合并失败（王国状态异常）');
      return {
        merged: true,
        union: keep.name,
        absorbed: keep === ca ? cb.name : ca.name,
        survivors: keep.name,
        pop: keep.pop, tiles: keep.tiles.length, gold: Math.round(keep.gold ?? 0), techs: keep.techs?.length ?? 0,
        note: '领土/建筑/军团/国库/科技已全量和平继承（get_kingdoms 复查）',
      };
    }

    case 'civ_control': {
      const action = str(a.action).trim();
      if (action === 'create') {
        const raceQ = str(a.race, '人类').trim() || '人类';
        const race = resolveRace(raceQ);
        if (race === null) throw new Error(`未知种族「${raceQ}」`);
        let x: number;
        let y: number;
        if (a.x != null && a.y != null) {
          x = Math.round(clamp(num(a.x, 0), 0, W - 1));
          y = Math.round(clamp(num(a.y, 0), 0, H - 1));
        } else {
          // 缺省落点：随机陆地（eng.randomLandSpot）
          const spot = eng.randomLandSpot();
          if (!spot) throw new Error('世界没有可用陆地');
          x = spot.x;
          y = spot.y;
        }
        const id = eng.createCiv(race, x, y);
        // 开国民众：createCiv 只立国不造人（空国 400 tick 后会被引擎自然覆灭）——补 6 名建国者
        let founders = 0;
        for (let k = 0; k < 6; k++) {
          const u = eng.spawnUnit(race, x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4, { silent: true, civ: id });
          if (u) founders++;
        }
        const c = eng.civs[id];
        return { created: true, id, name: c?.name ?? '?', race: RACES[race]?.name ?? '?', king: c?.kingName ?? '?', at: [x, y], founders, pop: c?.pop ?? founders };
      }
      const c = mustCiv(eng, str(a.name));
      if (action === 'rename') {
        const nm = str(a.newName).trim().slice(0, 16);
        if (!nm) throw new Error('缺少参数 newName（≤16 字）');
        const old = c.name;
        c.name = nm;
        return { renamed: true, id: c.id, from: old, to: nm };
      }
      if (action === 'newKing' || action === 'set_king') {
        const nm = str(a.newKing).trim().slice(0, 12);
        if (!nm) throw new Error('缺少参数 newKing（≤12 字）');
        const old = c.kingName;
        c.kingName = nm;
        return { id: c.id, kingdom: c.name, kingFrom: old, kingTo: nm };
      }
      if (action === 'destroy') {
        const nm = c.name;
        eng.eliminateCiv(c);
        return { destroyed: true, id: c.id, name: nm };
      }
      if (action === 'setgov') {
        const gov = Math.round(clamp(num(a.gov, 0), 0, 4));
        const GOV_NAMES = ['部落制', '君主制', '神权制', '共和制', '帝国制'];
        eng.setGov(c, gov, 'revolution');
        return { id: c.id, kingdom: c.name, gov: GOV_NAMES[gov] };
      }
      if (action === 'gold' || action === 'knowledge') {
        if (a.amount == null || !Number.isFinite(num(a.amount, NaN))) throw new Error('缺少参数 amount（可正可负）');
        const amount = Math.round(num(a.amount, 0));
        const key = action === 'gold' ? 'gold' : 'knowledge';
        const before = Math.floor(c[key] ?? 0);
        (c as unknown as Record<string, number>)[key] = clamp(before + amount, 0, 999999);
        return { id: c.id, kingdom: c.name, field: action === 'gold' ? '财富' : '知识', before, after: Math.floor(c[key] ?? 0), delta: amount };
      }
      if (action === 'complete_tech') {
        const tech = str(a.tech).trim();
        if (!tech) throw new Error('缺少参数 tech');
        if ((c.techs ?? []).includes(tech)) throw new Error(`「${c.name}」已研发过 ${tech}`);
        const avail = eng.availableTechs(c);
        if (!avail.some((t) => t.key === tech)) {
          const hint = avail.slice(0, 10).map((t) => t.key).join('、');
          throw new Error(`科技 ${tech} 目前不可研究（须前置齐备）。该国当前可研究：${hint || '（无可研究科技——可能已研究完或未建国库）'}`);
        }
        eng.completeTech(c, tech);
        return { completed: tech, kingdom: c.name, techCount: (c.techs ?? []).length };
      }
      throw new Error('action 只支持 create/rename/newKing/destroy/setgov/gold/knowledge/complete_tech');
    }

    case 'issue_directive': {
      const c = mustCiv(eng, str(a.kingdom));
      const kind = str(a.kind).trim() as DirectiveKind;
      if (!DIRECTIVES.includes(kind)) throw new Error(`未知旨意 ${kind}（可用：${DIRECTIVES.join('/')}）`);
      const param = Math.round(clamp(num(a.param, 0), 0, 999999));
      let targetId: number | undefined;
      const targetQ = str(a.target).trim();
      if (targetQ) {
        const t = mustCiv(eng, targetQ);
        targetId = t.id;
      }
      const d = eng.issueDirective(c.id, kind, param, targetId);
      if (!d) throw new Error(`旨意颁布失败（该国同时至多 2 条进行中旨意，且同种旨意不能重复）`);
      return { kingdom: c.name, kind, param: d.param, target: targetId != null ? eng.civs[targetId]?.name ?? null : null, text: d.text };
    }

    // ================= L3 战争外交 =================
    case 'get_world_war': {
      const ww = eng.worldWar;
      const alive = eng.wwAliveBelligerents();
      return {
        phase: ww.phase,
        startYear: ww.startYear,
        years: ww.phase === 'idle' ? 0 : Math.max(0, Math.floor(eng.yearF) - ww.startYear),
        belligerents: ww.belligerents.length,
        aliveBelligerents: alive.map((c) => c.name),
        kills: ww.kills,
        fallen: ww.fallen.map((f) => f.name),
        truces: ww.truces,
        activeTrucePairs: eng.wwTruce.size,
        nukes: ww.nukes, lasers: ww.lasers, drones: ww.drones, orbitals: ww.orbitals, plasmas: ww.plasmas, antimatters: ww.antimatters, emerged: ww.emerged,
        winner: ww.winner != null ? eng.civs[ww.winner]?.name ?? null : null,
        endText: ww.endText || null,
      };
    }

    case 'get_alliances': {
      const alliances = eng.alliances.map((al) => ({
        id: al.id,
        name: al.name,
        leader: eng.civs[al.leader]?.name ?? '?',
        members: al.members.filter((m) => eng.civs[m]?.alive).map((m) => eng.civs[m]?.name ?? '?'),
        cohesion: Math.round(al.cohesion),
        formedYear: al.formedYear,
        warsTogether: al.warsTogether,
        bonded: !!al.bonded,
      }));
      return { count: alliances.length, alliances };
    }

    case 'diplomacy_control': {
      const action = str(a.action).trim();
      const aq = str(a.a).trim();
      if (!aq) throw new Error('缺少参数 a');
      if (action === 'shift_relations') {
        // 种族关系：a/b 为种族名
        const rA = resolveRace(aq);
        if (rA === null) throw new Error(`未知种族「${aq}」`);
        const bq = str(a.b).trim();
        if (!bq) throw new Error('shift_relations 需要参数 b（种族名）');
        const rB = resolveRace(bq);
        if (rB === null) throw new Error(`未知种族「${bq}」`);
        if (rA === rB) throw new Error('不能改变种族与自身的关系');
        const delta = Math.round(clamp(num(a.delta, 0), -100, 100));
        const before = eng.raceRelOf(rA, rB);
        eng.shiftRaceRel(rA, rB, delta);
        return { races: [RACES[rA]?.name ?? rA, RACES[rB]?.name ?? rB], before: Math.round(before), delta, after: Math.round(eng.raceRelOf(rA, rB)) };
      }
      const ca = mustCiv(eng, aq);
      if (action === 'declare_war') {
        const b = str(a.b).trim();
        if (!b) throw new Error('declare_war 需要参数 b（敌方国名）');
        const cb = mustCiv(eng, b);
        if (cb.id === ca.id) throw new Error('不能对自己宣战');
        let reason: CasusKind = 'conquest';
        const rq = str(a.reason).trim();
        if (rq) {
          if (!WAR_REASONS.includes(rq as CasusKind)) throw new Error(`未知开战理由 ${rq}（可用：${WAR_REASONS.join('/')}）`);
          reason = rq as CasusKind;
        }
        const wd = eng.declareWar(ca.id, cb.id, reason, { force: true });
        if (!wd) throw new Error(`宣战失败：「${ca.name}」与「${cb.name}」可能已在交战，或世界法则禁止战争`);
        return { war: [ca.name, cb.name], reason, total: !!wd.total };
      }
      if (action === 'make_peace') {
        const b = str(a.b).trim();
        if (!b) throw new Error('make_peace 需要参数 b（敌国名）');
        const cb = mustCiv(eng, b);
        eng.makePeace(ca.id, cb.id, str(a.text).trim().slice(0, 120) || '神谕敕令：止戈');
        return { peace: [ca.name, cb.name] };
      }
      if (action === 'form_alliance') {
        const b = str(a.b).trim();
        if (!b) throw new Error('form_alliance 需要参数 b（盟友国名）');
        const cb = mustCiv(eng, b);
        const al = eng.formAlliance(ca, cb);
        if (!al) throw new Error(`结盟失败（双方须均无联盟，且世界至多 4 个联盟）：「${ca.name}」/「${cb.name}」`);
        return { alliance: al.name, leader: ca.name, members: [ca.name, cb.name] };
      }
      if (action === 'join_alliance') {
        const b = str(a.b).trim();
        if (!b) throw new Error('join_alliance 需要参数 b（盟主国名）');
        const cb = mustCiv(eng, b);
        if (eng.allianceOfCiv(ca.id)) throw new Error(`「${ca.name}」已在联盟中（先 leave_alliance）`);
        const al = eng.alliances.find((x) => x.leader === cb.id);
        if (!al) throw new Error(`「${cb.name}」不是任何联盟的盟主`);
        const ok = eng.joinAlliance(al, ca);
        if (!ok) throw new Error(`「${ca.name}」加入「${al.name}」被拒（联盟满员 5 国，或与盟主种族世仇太深）`);
        return { joined: al.name, kingdom: ca.name, leader: cb.name };
      }
      if (action === 'leave_alliance') {
        const al = eng.allianceOfCiv(ca.id);
        if (!al) throw new Error(`「${ca.name}」不在任何联盟中`);
        eng.leaveAlliance(ca.id, 'quit');
        return { left: al.name, kingdom: ca.name };
      }
      throw new Error('action 只支持 declare_war/make_peace/shift_relations/form_alliance/join_alliance/leave_alliance');
    }

    case 'world_war_control': {
      const action = str(a.action).trim();
      if (action === 'ignite') {
        if (!eng.devUltimateWar()) throw new Error('引燃失败（大战已在进行，或世上王国不足两个）');
        const alive = eng.wwAliveBelligerents();
        return { ignited: true, belligerents: alive.map((c) => c.name) };
      }
      if (action === 'truce') {
        const years = Math.round(clamp(num(a.years, 12), 1, 100));
        const n = eng.devWwTruce(years);
        if (n <= 0) throw new Error('当前没有进行中的世界大战');
        return { truce: true, years, pairs: n };
      }
      if (action === 'resume') {
        const n = eng.devWwResume();
        if (n <= 0) throw new Error('当前没有进行中的世界大战（或战端本就全线燃烧）');
        return { resumed: true, reignited: n };
      }
      if (action === 'end') {
        if (!eng.devWwEnd()) throw new Error('当前没有进行中的世界大战');
        return { ended: true };
      }
      throw new Error('action 只支持 ignite/truce/resume/end');
    }

    // ================= L4 神力天灾 =================
    case 'divine_power': {
      const kind = str(a.kind).trim();
      // v5：缺省落点 = 相机中心（造物主视野内降下神力——精准执行）；显式坐标照旧
      const x = Math.round(clamp(num(a.x, camX(eng)), 0, W - 1));
      const y = Math.round(clamp(num(a.y, camY(eng)), 0, H - 1));
      const power = Math.round(clamp(num(a.power, 2), 1, 3));
      const radius = Math.round(clamp(num(a.radius, 6), 2, 16));
      const at = [x, y];
      switch (kind) {
        case 'meteor': eng.meteor(x, y); return { cast: kind, at };
        case 'meteor_shower': { const count = 3 + power * 3; eng.meteorShower(x, y, radius, count); return { cast: kind, at, radius, count }; }
        case 'quake': { const m = 4.5 + power * 1.4; eng.natureQuake(x, y, m); return { cast: kind, at, magnitude: r2(m) }; }
        case 'volcano': eng.volcano(x, y, power); return { cast: kind, at, power };
        case 'lightning': { const n = 2 + power * 2; eng.lightning(x, y, n); return { cast: kind, at, bolts: n }; }
        case 'tornado': { const n = 1 + (power > 2 ? 1 : 0); eng.spawnTornado(x, y, n); return { cast: kind, at, count: n }; }
        case 'tsunami': { const lv = 4 + power * 2; eng.tsunami(x, y, lv); return { cast: kind, at, level: lv }; }
        case 'drought': { const r = 5 + power * 2; eng.drought(x, y, r); return { cast: kind, at, radius: r }; }
        case 'flood': eng.natureFlood(x, y); return { cast: kind, at };
        case 'blizzard': { const r = 5 + power * 2; eng.blizzard(x, y, r); return { cast: kind, at, radius: r }; }
        case 'sandstorm': eng.sandstorm(x, y, radius); return { cast: kind, at, radius };
        case 'typhoon': eng.typhoon(x, y, radius); return { cast: kind, at, radius };
        case 'acid_rain': eng.acidRain(x, y, radius); return { cast: kind, at, radius };
        case 'locust': eng.locust(x, y, radius); return { cast: kind, at, radius };
        case 'famine': eng.famineCloud(x, y, radius); return { cast: kind, at, radius };
        case 'ice_age': eng.iceAge(x, y, radius); return { cast: kind, at, radius };
        case 'sinkhole': eng.sinkhole(x, y, radius); return { cast: kind, at, radius };
        case 'blackhole': eng.blackhole(x, y, radius); return { cast: kind, at, radius };
        case 'wrath': eng.wrathStorm(x, y, radius); return { cast: kind, at, radius };
        case 'curse': eng.curseArea(x, y, radius); return { cast: kind, at, radius };
        case 'bless': eng.blessArea(x, y, radius); return { cast: kind, at, radius };
        case 'love': eng.loveArea(x, y, radius); return { cast: kind, at, radius };
        case 'heal': eng.healArea(x, y, radius); return { cast: kind, at, radius };
        case 'mutate': eng.mutateArea(x, y, radius); return { cast: kind, at, radius };
        case 'teleport': eng.teleportArea(x, y, radius); return { cast: kind, at, radius };
        case 'rain_cloud': eng.rainCloud(x, y, radius); return { cast: kind, at, radius };
        // —— v5 新增六神力（引擎早已有、神谕此前不可达的权柄）——
        case 'nuke': { eng.nuke(x, y, power); return { cast: kind, at, power, note: '蘑菇云/辐射污染/大坑——核打击已落地' }; }
        case 'plague': { const r = Math.max(3, radius); eng.plagueArea(x, y, r); return { cast: kind, at, radius: r }; }
        case 'fire': {
          const r = Math.max(2, Math.min(12, radius));
          let ignited = 0;
          const rr2 = r * r;
          for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) {
            for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) {
              if ((xx - x) ** 2 + (yy - y) ** 2 > rr2) continue;
              eng.ignite(yy * W + xx);
              ignited++;
            }
          }
          return { cast: kind, at, radius: r, ignited };
        }
        case 'boom': { eng.boom(x, y, Math.max(2, radius)); return { cast: kind, at, radius }; }
        case 'river': { eng.carveRiver(x, y); return { cast: kind, at }; }
        case 'oasis': { eng.createOasis(x, y); return { cast: kind, at }; }
        default: throw new Error(`未知神力 ${kind}（可用 32 种：meteor/meteor_shower/quake/volcano/lightning/tornado/tsunami/drought/flood/blizzard/sandstorm/typhoon/acid_rain/locust/famine/ice_age/sinkhole/blackhole/wrath/curse/bless/love/heal/mutate/teleport/rain_cloud/nuke/plague/fire/boom/river/oasis）`);
      }
    }

    case 'clear_area': {
      const x = Math.round(clamp(num(a.x, -1), 0, W - 1));
      const y = Math.round(clamp(num(a.y, -1), 0, H - 1));
      const radius = Math.round(clamp(num(a.radius, 5), 1, 20));
      const what = str(a.what, 'all').trim();
      if (!['units', 'buildings', 'fires', 'all'].includes(what)) throw new Error('what 只支持 units/buildings/fires/all');
      const wantUnits = what === 'units' || what === 'all';
      const wantBuilds = what === 'buildings' || what === 'all';
      const wantFires = what === 'fires' || what === 'all';
      const r2d = radius * radius;
      let killed = 0;
      let builds = 0;
      let fires = 0;
      if (wantUnits) {
        for (const u of eng.units) {
          if (u.dead) continue;
          if ((u.x - x) ** 2 + (u.y - y) ** 2 > r2d) continue;
          u.hp = 0;
          killed++;
          if (killed >= 200) break;
        }
      }
      for (let yy = Math.max(0, y - radius); yy <= Math.min(H - 1, y + radius); yy++) {
        for (let xx = Math.max(0, x - radius); xx <= Math.min(W - 1, x + radius); xx++) {
          if ((xx - x) ** 2 + (yy - y) ** 2 > r2d) continue;
          const i = yy * W + xx;
          if (wantBuilds && eng.building[i] > 0) {
            eng.destroyBuilding(i);
            builds++;
          }
          if (wantFires && eng.fireSet.has(i)) {
            // 直接清火标记（extinguishFire 需要 by:Unit，神谕侧无单位可传）
            eng.fire[i] = 0;
            eng.fireSet.delete(i);
            fires++;
          }
        }
      }
      return { at: [x, y], radius, cleared: { units: killed, buildings: builds, fires } };
    }

    case 'announce': {
      const text = str(a.text).trim().slice(0, 120);
      if (!text) throw new Error('缺少参数 text');
      const toneQ = str(a.tone, 'info').trim();
      const tone: 'info' | 'good' | 'danger' = toneQ === 'good' || toneQ === 'danger' ? toneQ : 'info';
      eng.toast(text, tone);
      eng.addEvent('oracle', text, {});
      return { announced: text, tone };
    }

    // ================= L5 机制热插拔 =================
    case 'update_law': {
      const id = str(a.id).trim();
      if (!id) throw new Error('缺少参数 id（见 manage_agent_laws 的 list）');
      // —— 跨代理冻结契约（41-a 已合并：update/list 均为实例方法，必须绑定 this 调用） ——
      const sys = eng.agentLaws as unknown as {
        update?: (id: string, patch: Record<string, unknown>) => string | null;
        list?: () => { id: string }[];
      };
      if (typeof sys.update !== 'function') throw new Error('机制引擎 v2 尚未就绪（等待 41-a 合并）');
      const err = sys.update.call(eng.agentLaws, id, { ...a, id: undefined });
      if (err) throw new Error(err);
      // 更新后的快照（防御式读取 list）
      if (typeof sys.list === 'function') {
        const snap = sys.list.call(eng.agentLaws).find((l) => l && l.id === id);
        if (snap) return { updated: id, law: snap };
      }
      return { updated: id };
    }

    case 'get_triggers': {
      const triggers = useGameStore.getState().triggers;
      return {
        count: triggers.length,
        triggers: triggers.map((t) => ({
          id: t.id, name: t.name, cond: describeCond(t.cond), action: t.action,
          at: [t.x, t.y], r: t.r, enabled: t.enabled, once: t.once, fired: t.fired, cd: t.cd, nextFireYear: t.nextFireYear,
        })),
      };
    }

    // ================= L6 元控制 =================
    case 'get_introspection': {
      return {
        toolCount: AGENT_TOOLS.length,
        tools: AGENT_TOOLS.map((t) => t.name),
        layers: TOOL_LAYERS.map((l) => ({ layer: l.layer, count: l.tools.length, tools: l.tools })),
      };
    }

    case 'get_saves': {
      const st = useGameStore.getState();
      st.refreshSlots();
      const metas = useGameStore.getState().slotMetas;
      return {
        count: metas.length,
        slots: metas.map((m) => ({
          key: m.key,
          savedAt: typeof m.savedAt === 'number' ? new Date(m.savedAt).toISOString().slice(0, 16).replace('T', ' ') : m.savedAt,
          source: m.source,
          year: m.year,
          pop: m.pop,
          civs: m.civs,
        })),
      };
    }

    case 'save_world': {
      const slot = str(a.slot, 'slot0').trim();
      if (!['slot0', 'slot1', 'slot2'].includes(slot)) throw new Error('slot 只支持 slot0/slot1/slot2');
      const ok = useGameStore.getState().saveToSlot(slot as 'slot0' | 'slot1' | 'slot2');
      return { saved: ok, slot, hint: ok ? undefined : '引擎未就绪或浏览器存储不可用' };
    }

    case 'time_control': {
      const action = str(a.action).trim();
      const st = useGameStore.getState();
      if (action === 'pause') {
        if (st.speed !== 0) st.togglePause();
      } else if (action === 'resume') {
        if (st.speed === 0) st.togglePause(); // togglePause：speed 0 → 1
      } else if (action === 'toggle') {
        st.togglePause();
      } else if (action === 'set_speed') {
        st.setSpeed(Math.round(clamp(num(a.speed, 1), 0, 16)));
      } else {
        throw new Error('action 只支持 pause/resume/toggle/set_speed');
      }
      const now = useGameStore.getState();
      return { action, speed: now.speed, paused: now.speed === 0 };
    }

    case 'camera_control': {
      const action = str(a.action).trim();
      const st = useGameStore.getState();
      if (action === 'jump') {
        const x = Math.round(clamp(num(a.x, -1), 0, W - 1));
        const y = Math.round(clamp(num(a.y, -1), 0, H - 1));
        st.jumpTo(x, y);
        return { jumped: true, at: [x, y] };
      }
      if (action === 'follow_unit') {
        const id = Math.round(num(a.id, -1));
        const u = mustUnit(eng, id);
        st.select(u.id, null);
        st.toggleFollow(); // select 置 follow=false，紧随 toggle 置 true 并设引擎 followId
        return { following: u.id, name: u.name };
      }
      if (action === 'follow_civ') {
        const c = mustCiv(eng, str(a.kingdom));
        st.jumpTo(eng.civCenterX(c), eng.civCenterY(c));
        st.selectCiv(c.id);
        return { selected: c.name, id: c.id, at: [Math.round(eng.civCenterX(c)), Math.round(eng.civCenterY(c))] };
      }
      if (action === 'unfollow') {
        const s0 = useGameStore.getState();
        if (s0.follow) {
          s0.toggleFollow(); // follow=true → false + 清引擎 followId
        } else if (s0.selUnit != null || s0.selCiv != null) {
          s0.select(null, null); // 兜底清选择与引擎 followId
        }
        return { unfollowed: true };
      }
      throw new Error('action 只支持 jump/follow_unit/follow_civ/unfollow');
    }

    default:
      throw new Error(`未知工具 ${name}`);
  }
}
