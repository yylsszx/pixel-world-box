// ============ 统治者议会 · L4a 地名解析层（纯代码） ============
// 硬约束落点：AI 只输出地名（锚点名/国名/方位词），坐标永远在这里解析。
// 调试原则：地名错误先查本层——是否唯一匹配、是否有候选返回；不要靠改提示词「教 AI 认地名」。
import type { GameEngine } from '@/lib/game/engine';
import type { Civ } from '@/lib/game/types';
import { W, H } from '@/lib/game/constants';
import { T } from '@/lib/game/types';
import { resolveRace } from '@/lib/game/agentLaws';
import type { ConveneContext, GeoAnchor } from './types';

export interface PlaceResolution {
  ok: boolean;
  x?: number;
  y?: number;
  radius?: number;
  /** 解析成功的规范地名（入汇报模板；失败时无） */
  label?: string;
  /** 解析失败时的候选清单（入日志/面板，供定位问题） */
  candidates?: string[];
  reason?: string;
}

/** 坐标 → 方位名（北/南/东/西/中土 组合） */
export function dirName(x: number, y: number): string {
  const ew = x < W / 3 ? '西' : x > (W * 2) / 3 ? '东' : '';
  const ns = y < H / 3 ? '北' : y > (H * 2) / 3 ? '南' : '';
  if (!ew && !ns) return '中土';
  return `${ns}${ew}部`;
}

/** 在 (x,y) 附近螺旋搜索最近陆地格（方位词解析用——天罚不落海） */
function nearestLand(eng: GameEngine, x: number, y: number): { x: number; y: number } {
  const isLand = (xx: number, yy: number) => {
    const t = eng.terrain[yy * W + xx];
    return t !== T.DEEP && t !== T.WATER && t !== T.LAVA;
  };
  for (let r = 0; r < Math.max(W, H); r += 2) {
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = Math.round(x + dx);
        const yy = Math.round(y + dy);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (isLand(xx, yy)) return { x: xx, y: yy };
      }
    }
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/** 文本相似包含匹配：精确 → 前缀 → 包含；返回唯一命中或候选 */
function uniqueInclude<T>(items: T[], name: (t: T) => string, q: string): { hit?: T; candidates?: string[] } {
  const query = q.trim();
  if (!query) return {};
  const exact = items.filter((t) => name(t) === query);
  if (exact.length === 1) return { hit: exact[0] };
  if (exact.length > 1) return { candidates: exact.map(name) };
  const prefix = items.filter((t) => name(t).startsWith(query) || query.startsWith(name(t)));
  if (prefix.length === 1) return { hit: prefix[0] };
  if (prefix.length > 1) return { candidates: prefix.map(name) };
  const incl = items.filter((t) => name(t).includes(query) || query.includes(name(t)));
  if (incl.length === 1) return { hit: incl[0] };
  if (incl.length > 1) return { candidates: incl.slice(0, 5).map(name) };
  return {};
}

/** 解析地名 → 坐标。解析顺序：本次召开锚点 → 列国名 → 方位词 → 世界中心 */
export function resolvePlace(eng: GameEngine, ctx: ConveneContext, query: string): PlaceResolution {
  const q = String(query ?? '').trim();
  if (!q) return { ok: false, reason: '缺少地名' };

  // 1) 锚点（火场/辐射区/瘟疫区 等——世界状态服务生成的地名）
  const anchors = ctx.anchors;
  const a = uniqueInclude(anchors, (t) => t.label, q);
  if (a.hit) return { ok: true, x: a.hit.x, y: a.hit.y, radius: a.hit.radius, label: a.hit.label };
  if (a.candidates?.length) return { ok: false, reason: `「${q}」匹配到多个锚点`, candidates: a.candidates };

  // 2) 列国名 → 首都坐标
  const civs = eng.civs.filter((c) => c.alive);
  const c = uniqueInclude(civs, (t) => t.name, q);
  if (c.hit) return { ok: true, ...civCapital(c.hit), label: c.hit.name };
  if (c.candidates?.length) return { ok: false, reason: `「${q}」匹配到多个王国`, candidates: c.candidates };

  // 3) 方位词（北境/南疆/东境/西陲/极北/中土/世界中心…）
  const dir = matchDirection(q);
  if (dir) {
    const land = nearestLand(eng, dir.x, dir.y);
    return { ok: true, x: land.x, y: land.y, label: dirName(land.x, land.y) };
  }

  // 4) 失败：返回全部锚点与列国名作候选（日志可定位「AI 引用了不存在的地名」）
  return {
    ok: false,
    reason: `未找到地名「${q}」（可用：锚点 ${anchors.map((t) => t.label).join('/') || '无'}；王国 ${civs.slice(0, 6).map((t) => t.name).join('/') || '无'}）`,
  };
}

/** 方位词 → 世界坐标（陆地吸附在 resolvePlace 内做） */
function matchDirection(q: string): { x: number; y: number } | null {
  const has = (...ws: string[]) => ws.some((w) => q.includes(w));
  if (has('世界中心', '中央', '中心')) return { x: W >> 1, y: H >> 1 };
  let x = W >> 1;
  let y = H >> 1;
  let any = false;
  if (has('北')) { y = Math.round(H * 0.22); any = true; }
  if (has('南')) { y = Math.round(H * 0.78); any = true; }
  if (has('东')) { x = Math.round(W * 0.78); any = true; }
  if (has('西')) { x = Math.round(W * 0.22); any = true; }
  if (has('极北')) y = Math.round(H * 0.08);
  if (has('极南')) y = Math.round(H * 0.92);
  return any ? { x, y } : null;
}

/** 王国首都坐标（无首都时取领土质心） */
export function civCapital(c: Civ): { x: number; y: number } {
  if (c.capital >= 0) return { x: c.capital % W, y: Math.floor(c.capital / W) };
  if (c.tiles.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const i of c.tiles) {
      sx += i % W;
      sy += Math.floor(i / W);
    }
    return { x: Math.round(sx / c.tiles.length), y: Math.round(sy / c.tiles.length) };
  }
  return { x: W >> 1, y: H >> 1 };
}

/** 解析国名 → Civ（宣战/议和/结盟/天赐/受旨 的目标）
 *  匹配序：精确/前缀/包含国名 → 种族描述词（「兽人王国」→ 唯一兽人国） */
export function resolveKingdom(eng: GameEngine, query: string): { ok: boolean; civ?: Civ; candidates?: string[]; reason?: string } {
  const q = String(query ?? '').trim();
  if (!q) return { ok: false, reason: '缺少国名' };
  const civs = eng.civs.filter((c) => c.alive);
  const r = uniqueInclude(civs, (t) => t.name, q);
  if (r.hit) return { ok: true, civ: r.hit };
  if (r.candidates?.length) return { ok: false, reason: `「${q}」匹配到多个王国`, candidates: r.candidates };
  // 种族描述词：「兽人王国」「人类之国」→ 该种族的唯一在世王国（多个则返回候选）
  const raceQ = q.replace(/(王国|之国|帝国|国境|国度|国)$/u, '').trim();
  if (raceQ && raceQ !== q) {
    const rid = resolveRace(raceQ);
    if (rid !== null) {
      const ofRace = civs.filter((c) => c.race === rid);
      if (ofRace.length === 1) return { ok: true, civ: ofRace[0] };
      if (ofRace.length > 1) return { ok: false, reason: `「${q}」匹配到 ${ofRace.length} 个${raceQ}王国`, candidates: ofRace.map((c) => c.name) };
    }
  }
  return { ok: false, reason: `没有名为「${q}」的王国（现存：${civs.slice(0, 6).map((t) => t.name).join('/') || '无'}）` };
}

/** 方位词粗判（digest 生成锚点名用） */
export function isDirectionalLabel(q: string): boolean {
  return matchDirection(q) !== null || q.includes('世界中心');
}

/** 供 digest 生成「XX火场」式锚点名 */
export function placeLabelFor(eng: GameEngine, x: number, y: number, suffix: string): string {
  const i = Math.round(y) * W + Math.round(x);
  const owner = eng.owner[i];
  if (owner >= 0 && eng.civs[owner]?.alive) return `${eng.civs[owner].name}${suffix}`;
  return `${dirName(x, y)}${suffix}`;
}

export type { GeoAnchor };
