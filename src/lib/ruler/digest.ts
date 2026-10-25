// ============ 统治者议会 · L1 世界状态服务 ============
// 唯一真相源（活引擎）→ 按席位裁剪摘要。
// 性能与 token 铁律：只给变化量与告警，不给全量；锚点表由本层生成（AI 只引用名）。
import type { GameEngine } from '@/lib/game/engine';
import { RACES } from '@/lib/game/types';
import { W, H } from '@/lib/game/constants';
import type { ConveneContext, GeoAnchor, RulerRole } from './types';
import { placeLabelFor } from './geo';

// ---------------- 快照（变化量的参照系） ----------------

export interface WorldSnapshot {
  year: number;
  civs: Record<string, { pop: number; tiles: number }>;
  wars: string[];
  species: Record<string, number>;
  fires: number;
  radiation: number;
  plague: number;
}

export function takeSnapshot(eng: GameEngine): WorldSnapshot {
  const civs: WorldSnapshot['civs'] = {};
  for (const c of eng.civs) {
    if (c.alive) civs[c.name] = { pop: c.pop, tiles: c.tiles.length };
  }
  const wars: string[] = [];
  for (const wd of eng.warData.values()) wars.push(`${Math.min(wd.a, wd.b)}-${Math.max(wd.a, wd.b)}`);
  const species: Record<string, number> = {};
  for (const u of eng.units) {
    if (u.dead) continue;
    const n = RACES[u.race]?.name;
    if (n) species[n] = (species[n] ?? 0) + 1;
  }
  let plague = 0;
  for (const u of eng.units) {
    if (!u.dead && u.infected) plague++;
  }
  return {
    year: Math.floor(eng.yearF),
    civs,
    wars,
    species,
    fires: eng.fireSet.size,
    radiation: eng.radSet.size,
    plague,
  };
}

// ---------------- 锚点表（代码生成地名 → 供 geo.ts 反解） ----------------

/** 粗网格聚类：把一组格子按 16×16 块聚合，返回前 topN 个簇的质心与规模 */
function clusterTiles(tiles: number[], topN: number): { cx: number; cy: number; n: number }[] {
  const blocks = new Map<string, { sx: number; sy: number; n: number }>();
  for (const i of tiles) {
    const x = i % W;
    const y = Math.floor(i / W);
    const k = `${x >> 4},${y >> 4}`;
    const b = blocks.get(k) ?? { sx: 0, sy: 0, n: 0 };
    b.sx += x;
    b.sy += y;
    b.n++;
    blocks.set(k, b);
  }
  return [...blocks.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, topN)
    .map((b) => ({ cx: Math.round(b.sx / b.n), cy: Math.round(b.sy / b.n), n: b.n }));
}

/** 生成本次召开的锚点：列国（按人口前 8）+ 火场/辐射区/瘟疫区（告警簇）+ 世界中心 */
export function buildAnchors(eng: GameEngine): GeoAnchor[] {
  const anchors: GeoAnchor[] = [];
  const usedLabels = new Set<string>();
  const push = (a: GeoAnchor) => {
    // 标签去重：同方向多个同类簇 → 追加 ·二 ·三 后缀（否则地名解析会「匹配到多个锚点」）
    let label = a.label;
    if (usedLabels.has(label)) {
      const suffix = ['二', '三', '四', '五'];
      for (const s of suffix) {
        if (!usedLabels.has(`${a.label}·${s}`)) {
          label = `${a.label}·${s}`;
          break;
        }
      }
    }
    usedLabels.add(label);
    anchors.push({ ...a, label });
  };
  // 列国锚点
  const civs = eng.civs.filter((c) => c.alive).sort((a, b) => b.pop - a.pop).slice(0, 8);
  for (const c of civs) {
    const cap = c.capital >= 0 ? { x: c.capital % W, y: Math.floor(c.capital / W) } : null;
    let x = W >> 1;
    let y = H >> 1;
    if (cap) {
      x = cap.x;
      y = cap.y;
    } else if (c.tiles.length) {
      let sx = 0;
      let sy = 0;
      for (const i of c.tiles.slice(0, 400)) {
        sx += i % W;
        sy += Math.floor(i / W);
      }
      x = Math.round(sx / Math.min(400, c.tiles.length));
      y = Math.round(sy / Math.min(400, c.tiles.length));
    }
    push({ label: c.name, x, y, radius: 4 });
  }
  // 火场锚点（前 2 大簇）
  if (eng.fireSet.size >= 6) {
    for (const cl of clusterTiles([...eng.fireSet], 2)) {
      push({
        label: placeLabelFor(eng, cl.cx, cl.cy, '火场'),
        x: cl.cx,
        y: cl.cy,
        radius: Math.max(3, Math.min(10, Math.round(Math.sqrt(cl.n) * 1.6))),
      });
    }
  }
  // 辐射区锚点
  if (eng.radSet.size >= 6) {
    for (const cl of clusterTiles([...eng.radSet.keys()], 1)) {
      push({
        label: placeLabelFor(eng, cl.cx, cl.cy, '辐射区'),
        x: cl.cx,
        y: cl.cy,
        radius: Math.max(3, Math.min(10, Math.round(Math.sqrt(cl.n) * 1.5))),
      });
    }
  }
  // 瘟疫区锚点（染病单位聚类）
  const sick: number[] = [];
  for (const u of eng.units) {
    if (!u.dead && u.infected) sick.push(Math.floor(u.y) * W + Math.floor(u.x));
  }
  if (sick.length >= 8) {
    for (const cl of clusterTiles(sick, 1)) {
      push({
        label: placeLabelFor(eng, cl.cx, cl.cy, '瘟疫区'),
        x: cl.cx,
        y: cl.cy,
        radius: Math.max(3, Math.min(9, Math.round(Math.sqrt(cl.n) * 1.4))),
      });
    }
  }
  // 世界中心
  push({ label: '世界中心', x: W >> 1, y: H >> 1, radius: 6 });
  return anchors;
}

// ---------------- 按席位裁剪摘要 ----------------

const fmtDelta = (d: number): string => (d > 0 ? `+${d}` : `${d}`);

function civLines(eng: GameEngine, snap: WorldSnapshot, prev: WorldSnapshot | null, top: number): string[] {
  const alive = eng.civs.filter((c) => c.alive).sort((a, b) => b.pop - a.pop).slice(0, top);
  return alive.map((c) => {
    const race = RACES[c.race]?.name ?? '?';
    const p0 = prev?.civs[c.name];
    const pd = p0 ? fmtDelta(c.pop - p0.pop) : '新';
    const td = p0 ? fmtDelta(c.tiles.length - p0.tiles) : '新';
    const gold = Math.floor(c.gold ?? 0);
    const know = Math.floor(c.knowledge ?? 0);
    return `- ${c.name}(${race}) 人口${c.pop}(${pd}) 领土${c.tiles.length}(${td}) 房${c.houses} 金${gold} 知${know}`;
  });
}

function warLines(eng: GameEngine): string[] {
  const out: string[] = [];
  for (const wd of eng.warData.values()) {
    const a = eng.civs[wd.a]?.name ?? '?';
    const b = eng.civs[wd.b]?.name ?? '?';
    const years = Math.max(1, Math.floor(eng.yearF) - wd.startYear);
    out.push(`- ${a}×${b} 已战${years}年 伤亡${Math.round(wd.casA)}/${Math.round(wd.casB)}`);
  }
  return out;
}

function alertLines(eng: GameEngine, ctx: ConveneContext, snap: WorldSnapshot): string[] {
  const out: string[] = [];
  if (snap.fires > 0) out.push(`火点${snap.fires}${snap.fires >= 30 ? '（蔓延失控）' : ''}`);
  if (snap.radiation > 0) out.push(`辐射格${snap.radiation}`);
  if (snap.plague > 0) out.push(`染疫${snap.plague}`);
  const weak = eng.civs.filter((c) => c.alive && c.pop < 15);
  if (weak.length) out.push(`弱国濒危：${weak.map((c) => c.name).slice(0, 4).join('/')}`);
  const dragons = eng.units.filter((u) => !u.dead && RACES[u.race]?.name === '巨龙').length;
  if (dragons > 0) out.push(`巨龙${dragons}只肆虐`);
  if (eng.worldWar.phase === 'running') out.push('世界大战进行中');
  return out;
}

function ecologyLines(eng: GameEngine, snap: WorldSnapshot, prev: WorldSnapshot | null, top: number): string[] {
  const entries = Object.entries(snap.species).sort((a, b) => b[1] - a[1]).slice(0, top);
  return entries.map(([name, n]) => {
    const d = prev?.species[name];
    return `- ${name}×${n}${d != null ? `(${fmtDelta(n - d)})` : '(新)'}`;
  });
}

/** 按席位生成摘要文本（变化量+告警；锚点名在其中自然出现，AI 引用之） */
export function buildDigest(
  eng: GameEngine,
  role: RulerRole,
  ctx: ConveneContext,
  prev: WorldSnapshot | null,
): string {
  const snap = ctx.snapshot;
  const L: string[] = [];
  const season = ['春', '夏', '秋', '冬'][eng.nature.season % 4] ?? '';
  const totalPop = Object.values(snap.civs).reduce((s, c) => s + c.pop, 0);
  L.push(`【世界】${snap.year}年·${season} 人口${totalPop} 王国${Object.keys(snap.civs).length} 战火${snap.wars.length}起 火点${snap.fires}`);

  // 变化总览（新增/覆灭/战端/终战）
  if (prev) {
    const now = new Set(Object.keys(snap.civs));
    const old = new Set(Object.keys(prev.civs));
    const born = [...now].filter((n) => !old.has(n));
    const fell = [...old].filter((n) => !now.has(n));
    const warsNow = new Set(snap.wars);
    const warsOld = new Set(prev.wars);
    const newWars = [...warsNow].filter((w) => !warsOld.has(w)).length;
    const endWars = [...warsOld].filter((w) => !warsNow.has(w)).length;
    const parts: string[] = [];
    if (born.length) parts.push(`新立${born.join('/')}`);
    if (fell.length) parts.push(`覆灭${fell.join('/')}`);
    if (newWars) parts.push(`新战端${newWars}起`);
    if (endWars) parts.push(`终战${endWars}起`);
    if (parts.length) L.push(`【变化】${parts.join('·')}`);
  }

  const alerts = alertLines(eng, ctx, snap);
  if (alerts.length) L.push(`【告警】${alerts.join('·')}`);

  switch (role) {
    case 'warlord': {
      L.push('【列国】');
      L.push(...civLines(eng, snap, prev, 8));
      const wars = warLines(eng);
      L.push(wars.length ? '【战火】' : '【战火】无');
      L.push(...(wars.length ? wars : ['- 世上无战事']));
      const als = eng.alliances.map((al) => `${eng.civs[al.leader]?.name ?? '?'}盟(${al.members.length}国)`).slice(0, 4);
      L.push(`【联盟】${als.length ? als.join('·') : '无'}`);
      break;
    }
    case 'calamity': {
      const civs = civLines(eng, snap, prev, 5);
      L.push('【列国】');
      L.push(...(civs.length ? civs : ['- 世上无文明']));
      let herb = 0;
      let pred = 0;
      for (const u of eng.units) {
        if (u.dead) continue;
        const d = RACES[u.race];
        if (!d || d.isCiv) continue;
        if (d.predator) pred++;
        else herb++;
      }
      L.push(`【生态】食草${herb} 掠食${pred}${pred === 0 && herb > 120 ? '（掠食者缺位·食草失控）' : ''}`);
      break;
    }
    case 'creator': {
      L.push('【物种】');
      L.push(...(ecologyLines(eng, snap, prev, 12).length ? ecologyLines(eng, snap, prev, 12) : ['- 世上无生灵']));
      const rare = Object.entries(snap.species).filter(([, n]) => n > 0 && n < 6);
      if (rare.length) L.push(`【濒危】${rare.map(([n, c]) => `${n}×${c}`).join('·')}`);
      L.push(`【演化】动态物种${eng.dynRaces.size}种`);
      break;
    }
    case 'steward': {
      L.push('【列国】');
      L.push(...(civLines(eng, snap, prev, 8).length ? civLines(eng, snap, prev, 8) : ['- 世上无文明']));
      break;
    }
  }

  L.push(`【锚点】${ctx.anchors.map((a) => a.label).join('·')}`);
  return L.join('\n');
}
