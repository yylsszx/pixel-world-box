// ============ 统治者议会 · L4 执行器（纯代码） ============
// 管线：解析地名 → 校验参数（二次防御）→ 执行（直呼引擎）→ 回读验证（以世界状态为准）→ 日志。
// 铁律：绝不以「AI 说成功」为准——每个动作都有回读；延迟生效类（陨石下落/地震塌房）
// 走延迟回读队列（council.tick 轮询 dueTick）。
// 新增动作六步之第 4 步：在 EXECUTORS 补一条（Record<RulerAction,…> 类型强制全同步）。
import type { GameEngine } from '@/lib/game/engine';
import type { Civ } from '@/lib/game/types';
import { RACES, T } from '@/lib/game/types';
import { W, H } from '@/lib/game/constants';
import { resolveRace } from '@/lib/game/agentLaws';
import type { ConveneContext, RulerAction, RulerIntent, RulerLayer } from './types';
import { resolveKingdom, resolvePlace, type PlaceResolution } from './geo';
import type { ReportSlots } from './reporter';

export interface RegionState {
  fires: number;
  rad: number;
  units: number;
  builds: number;
  terrain: number;
}

export interface ExecOutcome {
  ok: boolean;
  /** 失败/存疑时定位的层 */
  layer: RulerLayer;
  reason?: string;
  /** 汇报槽值（规范地名/国名/数字——全部来自代码解析） */
  slots: ReportSlots;
  at?: [number, number];
  /** 延迟回读（dueTick 之后由 council 轮询执行 verify） */
  deferred?: { dueTick: number; verify: () => { ok: boolean; reason?: string } };
}

// ---------------- 区域状态采样（回读的度量衡） ----------------

function sampleRegion(eng: GameEngine, x: number, y: number, r: number): RegionState {
  let fires = 0;
  let rad = 0;
  let units = 0;
  let builds = 0;
  let terrain = 0;
  const r2 = r * r;
  for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++) {
    for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++) {
      if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
      const i = yy * W + xx;
      if (eng.fireSet.has(i)) fires++;
      if (eng.radSet.has(i)) rad++;
      if (eng.building[i] > 0) builds++;
      terrain = (terrain * 31 + eng.terrain[i]) | 0;
    }
  }
  for (const u of eng.units) {
    if (!u.dead && (u.x - x) ** 2 + (u.y - y) ** 2 <= r2) units++;
  }
  return { fires, rad, units, builds, terrain };
}

/** 两份区域采样是否有可观测差异 */
function regionChanged(a: RegionState, b: RegionState): boolean {
  return a.fires !== b.fires || a.rad !== b.rad || a.units !== b.units || a.builds !== b.builds || a.terrain !== b.terrain;
}

// ---------------- 小工具 ----------------

const SCALE_RADIUS = [0, 4, 8, 13];
const SIZE_RADIUS = [0, 4, 7, 11];

function fail(layer: RulerLayer, reason: string, slots: ReportSlots = {}): ExecOutcome {
  return { ok: false, layer, reason, slots };
}

function mustPlace(eng: GameEngine, ctx: ConveneContext, q: string): { res?: PlaceResolution; bad?: ExecOutcome } {
  const res = resolvePlace(eng, ctx, q);
  if (!res.ok || res.x === undefined || res.y === undefined) {
    return {
      bad: fail(
        '地名解析',
        `${res.reason ?? '地名解析失败'}${res.candidates?.length ? `；候选：${res.candidates.join('/')}` : ''}`,
        { place: String(q).slice(0, 8) },
      ),
    };
  }
  return { res };
}

function mustCiv(eng: GameEngine, q: string): { civ?: Civ; bad?: ExecOutcome } {
  const r = resolveKingdom(eng, q);
  if (!r.ok || !r.civ) {
    return { bad: fail('地名解析', `${r.reason ?? '国名解析失败'}${r.candidates?.length ? `；候选：${r.candidates.join('/')}` : ''}`, { a: String(q).slice(0, 8) }) };
  }
  return { civ: r.civ };
}

function warExists(eng: GameEngine, a: number, b: number): boolean {
  for (const wd of eng.warData.values()) {
    if ((wd.a === a && wd.b === b) || (wd.a === b && wd.b === a)) return true;
  }
  return false;
}

// ---------------- 各动作执行器（Record 强制全同步） ----------------

type ExecFn = (eng: GameEngine, ctx: ConveneContext, p: Record<string, string | number | boolean>) => ExecOutcome;

/** 延迟回读的等待 tick（神力生效动画：陨石下落 34t/地震塌房/火山堆积…） */
const STRIKE_DEFER: Record<string, number> = {
  meteor: 60, meteor_shower: 70, quake: 55, volcano: 70, tsunami: 55, typhoon: 60,
  ice_age: 50, blackhole: 60, wrath: 60, locust: 55, famine: 55, drought: 50,
  blizzard: 50, sandstorm: 45, acid_rain: 45, sinkhole: 40, flood: 50, tornado: 55,
};

export const EXECUTORS: Record<RulerAction, ExecFn> = {
  declare_war: (eng, _ctx, p) => {
    const A = mustCiv(eng, String(p.a ?? ''));
    if (A.bad) return A.bad;
    const B = mustCiv(eng, String(p.b ?? ''));
    if (B.bad) return B.bad;
    const ca = A.civ!;
    const cb = B.civ!;
    const slots = { a: ca.name, b: cb.name };
    if (ca.id === cb.id) return fail('执行', '不能对自己宣战', slots);
    if (warExists(eng, ca.id, cb.id)) return fail('执行', '两国已在交战中', slots);
    const reason = String(p.reason ?? 'conquest') as never;
    const wd = eng.declareWar(ca.id, cb.id, reason, { force: true });
    if (!wd) return fail('执行', '宣战失败（引擎拒绝）', slots);
    // 回读：战争数据中必须出现该配对
    if (!warExists(eng, ca.id, cb.id)) return { ok: false, layer: '回读', reason: '回读不符：warData 中未见新战端', slots };
    return { ok: true, layer: '回读', reason: '回读通过：战端已立', slots };
  },

  make_peace: (eng, _ctx, p) => {
    const A = mustCiv(eng, String(p.a ?? ''));
    if (A.bad) return A.bad;
    const B = mustCiv(eng, String(p.b ?? ''));
    if (B.bad) return B.bad;
    const ca = A.civ!;
    const cb = B.civ!;
    const slots = { a: ca.name, b: cb.name };
    if (!warExists(eng, ca.id, cb.id)) return fail('执行', '两国本无战事', slots);
    eng.makePeace(ca.id, cb.id, '统治者议会敕令：止戈休兵', 25);
    if (warExists(eng, ca.id, cb.id)) return { ok: false, layer: '回读', reason: '回读不符：战端仍在', slots };
    return { ok: true, layer: '回读', reason: '回读通过：战端已息', slots };
  },

  form_alliance: (eng, _ctx, p) => {
    const A = mustCiv(eng, String(p.a ?? ''));
    if (A.bad) return A.bad;
    const B = mustCiv(eng, String(p.b ?? ''));
    if (B.bad) return B.bad;
    const ca = A.civ!;
    const cb = B.civ!;
    const slots = { a: ca.name, b: cb.name };
    const al = eng.formAlliance(ca, cb);
    if (!al) return fail('执行', '结盟失败（双方须均无联盟，且世界至多 4 个联盟）', slots);
    if (!eng.allianceOfCiv(ca.id)) return { ok: false, layer: '回读', reason: '回读不符：联盟表中未见该国', slots };
    return { ok: true, layer: '回读', reason: `回读通过：联盟「${al.name}」成立`, slots };
  },

  issue_directive: (eng, _ctx, p) => {
    const K = mustCiv(eng, String(p.kingdom ?? ''));
    if (K.bad) return K.bad;
    const c = K.civ!;
    const slots = { k: c.name, kind: String(p.kind ?? '') };
    let targetId: number | undefined;
    const tq = p.target !== undefined ? String(p.target) : '';
    if (tq) {
      const T2 = mustCiv(eng, tq);
      if (T2.bad) return T2.bad;
      targetId = T2.civ!.id;
    }
    const d = eng.issueDirective(c.id, String(p.kind) as never, Number(p.param ?? 0) || 0, targetId);
    if (!d) return fail('执行', '颁旨失败（该国同时至多 2 条进行中旨意，且同种旨意不能重复）', slots);
    // 回读：该国活跃旨意列表出现同种旨意
    const found = eng.directives.some((x) => x.civ === c.id && x.kind === String(p.kind) && x.status === 'active');
    if (!found) return { ok: false, layer: '回读', reason: '回读不符：旨意表未见该条', slots };
    return { ok: true, layer: '回读', reason: '回读通过：旨意已录', slots, at: c.capital >= 0 ? [c.capital % W, Math.floor(c.capital / W)] : undefined };
  },

  divine_strike: (eng, ctx, p) => {
    const P = mustPlace(eng, ctx, String(p.place ?? ''));
    if (P.bad) return P.bad;
    const x = P.res!.x!;
    const y = P.res!.y!;
    const power = String(p.power ?? 'meteor');
    const scale = Number(p.scale ?? 2);
    const radius = Math.max(P.res!.radius ?? 0, SCALE_RADIUS[scale] ?? 8);
    const slots = { power, place: P.res!.label ?? String(p.place).slice(0, 8) };
    const before = sampleRegion(eng, x, y, radius);
    // 执行（与 bridge-ext 神力口径一致——但此处是统治者议会专用通路，不经工具目录）
    try {
      switch (power) {
        case 'meteor': eng.meteor(x, y); break;
        case 'meteor_shower': eng.meteorShower(x, y, radius, 3 + scale * 3); break;
        case 'lightning': eng.lightning(x, y, 2 + scale * 2); break;
        case 'fire': {
          const rr = Math.max(2, Math.min(12, radius));
          for (let yy = Math.max(0, y - rr); yy <= Math.min(H - 1, y + rr); yy++) {
            for (let xx = Math.max(0, x - rr); xx <= Math.min(W - 1, x + rr); xx++) {
              if ((xx - x) ** 2 + (yy - y) ** 2 <= rr * rr) eng.ignite(yy * W + xx);
            }
          }
          break;
        }
        case 'plague': eng.plagueArea(x, y, Math.max(3, radius)); break;
        case 'quake': eng.natureQuake(x, y, 4.5 + scale * 1.4); break;
        case 'volcano': eng.volcano(x, y, scale); break;
        case 'tornado': eng.spawnTornado(x, y, 1 + (scale > 2 ? 1 : 0)); break;
        case 'tsunami': eng.tsunami(x, y, 4 + scale * 2); break;
        case 'flood': eng.natureFlood(x, y); break;
        case 'drought': eng.drought(x, y, 5 + scale * 2); break;
        case 'blizzard': eng.blizzard(x, y, 5 + scale * 2); break;
        case 'sandstorm': eng.sandstorm(x, y, radius); break;
        case 'typhoon': eng.typhoon(x, y, radius); break;
        case 'acid_rain': eng.acidRain(x, y, radius); break;
        case 'locust': eng.locust(x, y, radius); break;
        case 'famine': eng.famineCloud(x, y, radius); break;
        case 'ice_age': eng.iceAge(x, y, radius); break;
        case 'sinkhole': eng.sinkhole(x, y, radius); break;
        case 'blackhole': eng.blackhole(x, y, radius); break;
        case 'wrath': eng.wrathStorm(x, y, radius); break;
        case 'curse': eng.curseArea(x, y, radius); break;
        case 'boom': eng.boom(x, y, Math.max(2, radius)); break;
        case 'nuke': eng.nuke(x, y, scale); break;
        default: return fail('执行', `未知神力 ${power}`, slots);
      }
    } catch (e) {
      return fail('执行', `神力施放异常：${e instanceof Error ? e.message : String(e)}`, slots);
    }
    const defer = STRIKE_DEFER[power] ?? 0;
    const verify = () => {
      const after = sampleRegion(eng, x, y, radius);
      if (!regionChanged(before, after)) {
        return { ok: false, reason: '回读不符：作用区域无可观测变化（可能落于空海/空地）' };
      }
      const parts: string[] = [];
      if (after.fires !== before.fires) parts.push(`火${before.fires}→${after.fires}`);
      if (after.rad !== before.rad) parts.push(`辐射${before.rad}→${after.rad}`);
      if (after.units !== before.units) parts.push(`生灵${before.units}→${after.units}`);
      if (after.builds !== before.builds) parts.push(`建筑${before.builds}→${after.builds}`);
      return { ok: true, reason: `回读通过：${parts.length ? parts.join('·') : '地形已变'}` };
    };
    if (defer > 0) {
      // 延迟生效类：先登记「执行中」，到点回读
      return { ok: true, layer: '执行', reason: `已施放，${Math.round(defer / 15)} 年内回读`, slots, at: [x, y], deferred: { dueTick: eng.tickCount + defer, verify } };
    }
    const v = verify();
    return { ok: v.ok, layer: '回读', reason: v.reason, slots, at: [x, y] };
  },

  heal_land: (eng, ctx, p) => {
    const P = mustPlace(eng, ctx, String(p.place ?? ''));
    if (P.bad) return P.bad;
    const x = P.res!.x!;
    const y = P.res!.y!;
    const radius = Math.max(P.res!.radius ?? 0, SIZE_RADIUS[Number(p.size ?? 2)] ?? 7);
    const slots = { place: P.res!.label ?? String(p.place).slice(0, 8) };
    const before = sampleRegion(eng, x, y, radius);
    if (before.fires === 0 && before.rad === 0) {
      return { ok: true, layer: '回读', reason: '该地本就洁净（无火无辐射）——圣光加护', slots, at: [x, y] };
    }
    eng.healArea(x, y, radius);
    const after = sampleRegion(eng, x, y, radius);
    if (after.fires >= before.fires && after.rad >= before.rad) {
      return { ok: false, layer: '回读', reason: `回读不符：火${before.fires}→${after.fires} 辐射${before.rad}→${after.rad}`, slots };
    }
    return { ok: true, layer: '回读', reason: `回读通过：火${before.fires}→${after.fires} 辐射${before.rad}→${after.rad}`, slots, at: [x, y] };
  },

  bless_land: (eng, ctx, p) => {
    const P = mustPlace(eng, ctx, String(p.place ?? ''));
    if (P.bad) return P.bad;
    const x = P.res!.x!;
    const y = P.res!.y!;
    const radius = Math.max(P.res!.radius ?? 0, SIZE_RADIUS[Number(p.size ?? 2)] ?? 7);
    const slots = { place: P.res!.label ?? String(p.place).slice(0, 8) };
    let alive = 0;
    const r2 = radius * radius;
    for (const u of eng.units) {
      if (!u.dead && (u.x - x) ** 2 + (u.y - y) ** 2 <= r2) alive++;
    }
    if (alive === 0) return fail('执行', '该地无生灵可受祝福', slots);
    const n = eng.blessArea(x, y, radius);
    let blessed = 0;
    for (const u of eng.units) {
      if (!u.dead && (u.bless ?? 0) > 0 && (u.x - x) ** 2 + (u.y - y) ** 2 <= r2) blessed++;
    }
    if (blessed === 0) return { ok: false, layer: '回读', reason: '回读不符：范围内无受祝单位', slots };
    return { ok: true, layer: '回读', reason: `回读通过：${blessed} 生灵受祝（命中 ${n}）`, slots, at: [x, y] };
  },

  spawn_species: (eng, ctx, p) => {
    const name = String(p.name ?? '').slice(0, 8);
    const slots = { name };
    const pq = p.place !== undefined ? String(p.place) : '';
    let x: number | undefined;
    let y: number | undefined;
    if (pq) {
      const P = mustPlace(eng, ctx, pq);
      if (P.bad) return P.bad;
      x = P.res!.x;
      y = P.res!.y;
    }
    const vis: Record<string, number | boolean> = {};
    if (p.hue !== undefined) vis.hue = Number(p.hue);
    if (p.size !== undefined) vis.size = Number(p.size);
    if (p.horns !== undefined) vis.horns = Number(p.horns);
    if (p.glow !== undefined) vis.glow = Boolean(p.glow);
    const res = eng.spawnCustomSpecies({
      name,
      count: Number(p.count ?? 4),
      x,
      y,
      predator: p.predator !== undefined ? Boolean(p.predator) : undefined,
      hostile: p.hostile !== undefined ? Boolean(p.hostile) : undefined,
      hp: p.hp !== undefined ? Number(p.hp) : undefined,
      dmg: p.dmg !== undefined ? Number(p.dmg) : undefined,
      speed: p.speed !== undefined ? Number(p.speed) : undefined,
      maxAge: p.maxAge !== undefined ? Number(p.maxAge) : undefined,
      cap: p.cap !== undefined ? Number(p.cap) : undefined,
      form: p.form !== undefined ? String(p.form) : undefined,
      archetype: p.archetype !== undefined ? String(p.archetype).slice(0, 24) : undefined,
      vis: Object.keys(vis).length > 0 ? (vis as never) : undefined,
    });
    if (!res) return fail('执行', '创造失败（物种注册表已满 64 上限）', slots);
    const def = RACES[res.id];
    // 回读：新物种个体真实在场
    let live = 0;
    for (const u of eng.units) {
      if (!u.dead && u.race === res.id) live++;
    }
    if (live < res.spawned) return { ok: false, layer: '回读', reason: `回读不符：应降 ${res.spawned} 只，实见 ${live} 只`, slots };
    return { ok: true, layer: '回读', reason: `回读通过：${live} 只降临（hp${def?.hp}/攻${def?.dmg}）`, slots, at: res.at ? [res.at[0], res.at[1]] : undefined };
  },

  hybridize: (eng, _ctx, p) => {
    const ra = resolveRace(String(p.a ?? ''));
    const rb = resolveRace(String(p.b ?? ''));
    const slots = { a: RACES[ra ?? -1]?.name ?? String(p.a).slice(0, 6), b: RACES[rb ?? -1]?.name ?? String(p.b).slice(0, 6) };
    if (ra === null || rb === null) return fail('地名解析', `物种名解析失败（${ra === null ? p.a : p.b} 不存在）`, slots);
    if (ra === rb) return fail('执行', '同一物种无法与自身融合', slots);
    const pop = new Map<number, number>();
    for (const u of eng.units) {
      if (!u.dead) pop.set(u.race, (pop.get(u.race) ?? 0) + 1);
    }
    if ((pop.get(ra) ?? 0) < 8 || (pop.get(rb) ?? 0) < 8) {
      return fail('执行', `种群不足（${RACES[ra]?.name}×${pop.get(ra) ?? 0} / ${RACES[rb]?.name}×${pop.get(rb) ?? 0}，双方各需 ≥8）`, slots);
    }
    const res = eng.forceHybridize(ra, rb);
    if (!res) return fail('执行', '融合失败（注册表满 / 3 代内血亲 / 冷却中）', slots);
    let live = 0;
    for (const u of eng.units) {
      if (!u.dead && u.race === res.id) live++;
    }
    if (live === 0) return { ok: false, layer: '回读', reason: '回读不符：未见新种个体', slots };
    return { ok: true, layer: '回读', reason: `回读通过：「${res.name}」${live} 只在世（转化 ${res.converted}）`, slots: { ...slots, name: res.name } };
  },

  spawn_creatures: (eng, ctx, p) => {
    const race = String(p.race ?? '');
    const rid = resolveRace(race);
    const slots: ReportSlots = { race: RACES[rid ?? -1]?.name ?? race.slice(0, 6), n: Number(p.count ?? 6) };
    if (rid === null) return fail('地名解析', `物种「${race}」不存在`, slots);
    let x: number;
    let y: number;
    const pq = p.place !== undefined ? String(p.place) : '';
    if (pq) {
      const P = mustPlace(eng, ctx, pq);
      if (P.bad) return P.bad;
      x = P.res!.x!;
      y = P.res!.y!;
      slots.place = P.res!.label ?? pq.slice(0, 8);
    } else {
      const spot = eng.randomLandSpot();
      if (!spot) return fail('执行', '世界没有可用陆地', slots);
      x = spot.x;
      y = spot.y;
      slots.place = '旷野';
    }
    const before = new Map<number, number>();
    for (const u of eng.units) {
      if (!u.dead) before.set(u.race, (before.get(u.race) ?? 0) + 1);
    }
    let n = 0;
    const count = Number(p.count ?? 6);
    for (let k = 0; k < count; k++) {
      const sx = k === 0 ? x : x + (Math.random() - 0.5) * 6;
      const sy = k === 0 ? y : y + (Math.random() - 0.5) * 6;
      if (eng.spawnUnit(rid, sx, sy, { silent: true })) n++;
    }
    if (n === 0) return fail('执行', '落点无法容纳任何个体', slots);
    const after = new Map<number, number>();
    for (const u of eng.units) {
      if (!u.dead) after.set(u.race, (after.get(u.race) ?? 0) + 1);
    }
    const grew = (after.get(rid) ?? 0) - (before.get(rid) ?? 0);
    if (grew < n) return { ok: false, layer: '回读', reason: `回读不符：放置 ${n} 只，净增 ${grew} 只`, slots };
    return { ok: true, layer: '回读', reason: `回读通过：${RACES[rid]?.name} 净增 ${grew} 只`, slots: { ...slots, n }, at: [x, y] };
  },

  boost_kingdom: (eng, _ctx, p) => {
    const K = mustCiv(eng, String(p.kingdom ?? ''));
    if (K.bad) return K.bad;
    const c = K.civ!;
    const what = String(p.what ?? 'gold');
    const amount = Math.round(Number(p.amount ?? 100));
    const slots = { k: c.name, what };
    const before = Math.floor((what === 'gold' ? c.gold : c.knowledge) ?? 0);
    const expected = Math.max(0, Math.min(999999, before + amount));
    if (what === 'gold') c.gold = expected;
    else c.knowledge = expected;
    const after = Math.floor((what === 'gold' ? c.gold : c.knowledge) ?? 0);
    if (after !== expected) return { ok: false, layer: '回读', reason: `回读不符：${before}→${after}（期望 ${expected}）`, slots };
    return { ok: true, layer: '回读', reason: `回读通过：${before}→${after}`, slots, at: c.capital >= 0 ? [c.capital % W, Math.floor(c.capital / W)] : undefined };
  },

  terraform: (eng, ctx, p) => {
    const P = mustPlace(eng, ctx, String(p.place ?? ''));
    if (P.bad) return P.bad;
    const x = P.res!.x!;
    const y = P.res!.y!;
    const radius = SIZE_RADIUS[Number(p.size ?? 2)] ?? 7;
    const slots = { terrain: String(p.terrain ?? ''), place: P.res!.label ?? String(p.place).slice(0, 8) };
    const TERRAIN_MAP: Record<string, number> = {
      water: T.WATER, grass: T.GRASS, forest: T.FOREST, hill: T.HILL,
      mountain: T.MOUNTAIN, sand: T.SAND, snow: T.SNOW,
    };
    const t = TERRAIN_MAP[String(p.terrain ?? '')];
    if (t === undefined) return fail('执行', `未知地形 ${String(p.terrain)}`, slots);
    const before = sampleRegion(eng, x, y, radius);
    let n = 0;
    const r2 = radius * radius;
    for (let yy = Math.max(0, Math.floor(y - radius)); yy <= Math.min(H - 1, Math.ceil(y + radius)); yy++) {
      for (let xx = Math.max(0, Math.floor(x - radius)); xx <= Math.min(W - 1, Math.ceil(x + radius)); xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
        const i = yy * W + xx;
        if (eng.terrain[i] !== t) {
          eng.setTerrain(i, t);
          n++;
        }
      }
    }
    const after = sampleRegion(eng, x, y, radius);
    if (!regionChanged(before, after)) {
      return { ok: true, layer: '回读', reason: '该地已是目标地形（无需重塑）', slots, at: [x, y] };
    }
    if (n === 0) return { ok: false, layer: '回读', reason: '回读不符：重塑格数为 0', slots };
    return { ok: true, layer: '回读', reason: `回读通过：重塑 ${n} 格`, slots, at: [x, y] };
  },
};

/** 执行一条意图（解析→校验→执行→回读，全链日志由调用方记录） */
export function executeIntent(eng: GameEngine, ctx: ConveneContext, intent: RulerIntent): ExecOutcome {
  try {
    return EXECUTORS[intent.action](eng, ctx, intent.params);
  } catch (e) {
    return {
      ok: false,
      layer: '执行',
      reason: `执行器异常：${e instanceof Error ? e.message : String(e)}`,
      slots: {},
    };
  }
}
