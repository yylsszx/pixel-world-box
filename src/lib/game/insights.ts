// ============ 智能洞察规则引擎（UI 超级智能化 · Task 61-c） ============
// 纯逻辑规则引擎：每 15s 由 SmartHub 轮询，对世界做一次全量「体检」，
// 产出按优先级排序的情境洞察（每条带 1-3 个一键处置动作）。
// 设计纪律：
//   ① 零弹窗打扰——洞察只进「智能中枢」按钮徽标与命令面板推荐位，
//     用户主动打开才见（承接 Task 59「去掉事件通知弹窗」的产品决策）；
//   ② 显示语义：条件持续 → 洞察常驻列表；条件消失 → 45s 宽限后移除；
//     一次性里程碑（崛起/突破/新物种）粘滞 5 分钟；冷却只控制「新」徽标；
//   ③ 规则评估 O(单位数 + 火点 + 文明对) 单遍扫描，15s 一次可忽略；
//   ④ 动作只输出描述符（panel/fly/divine/oracle/speed/civ），
//     由 UI 层解释执行——本模块不 import 任何 React/store（可 node 冒烟）。
import { W, MAX_UNITS } from './constants';
import { RACES } from './types';
import { nevoSnapshot } from './neuro-evolve';
import type { GameEngine } from './engine';

/** 一键处置动作描述符（UI 层 runInsightAction 解释执行） */
export interface InsightAction {
  label: string;
  kind: 'panel' | 'fly' | 'divine' | 'oracle' | 'speed' | 'civ' | 'note';
  /** kind=panel：目标面板名 */
  panel?: 'kingdoms' | 'eco' | 'nature' | 'evo' | 'neuro' | 'chronicle' | 'race' | 'societal';
  /** kind=fly/divine：世界坐标（像素） */
  x?: number;
  y?: number;
  /** kind=divine：工具 id（applyTool 语义：heal/bless/rain_cloud/…） */
  tool?: string;
  /** kind=oracle：神谕提示词 */
  prompt?: string;
  /** kind=speed：目标速度 */
  speed?: number;
  /** kind=civ：文明 id */
  civId?: number;
  /** kind=note：反馈文本 */
  text?: string;
}

export interface Insight {
  id: string;
  /** 语义图标名（小写，UI 层映射 lucide 组件） */
  icon: string;
  tone: 'danger' | 'warn' | 'info' | 'good';
  title: string;
  desc: string;
  actions: InsightAction[];
  /** 排序优先级（大在前） */
  prio: number;
  /** 本轮为新出现的洞察（驱动按钮徽标；由 collectInsights 计算，规则无需填写） */
  fresh?: boolean;
}

/** 评估选项：idleMs 由 UI 层注入（用户无操作时长） */
export interface InsightOpts {
  idleMs?: number;
  /** 评估时刻（默认 Date.now()；测试注入） */
  now?: number;
}

// —— 模块级记账（冷却 / 一次性里程碑 / 常驻表；HMR 重置可接受） ——
const cooldown = new Map<string, number>();
const milestone = new Set<string>();
/** 常驻洞察表：id → { ins, until }（until = 条件消失后的宽限截止） */
const active = new Map<string, { ins: Insight; until: number }>();
let lastDynSpecies = -1;
let idleTipIdx = 0;

const IDLE_TIPS = [
  '试试框选一群单位编组指挥，或点开王国榜俯瞰列强',
  'Ctrl+K 唤起命令面板，任何想做的事都能搜到——搜不到就问神谕',
  '左下角角标柱实时显示时间季节与各物种人口',
  '神谕面板可以直接下指令：造物种、装 Mod、改法则、写剧情',
  '演化图谱记录每一次种化与新物种的诞生谱系',
];

/** 候选：规则产物 + 冷却/粘滞参数（不外泄） */
interface Cand extends Insight {
  /** 「新」徽标冷却（ms） */
  cd: number;
  /** 条件消失后的粘滞时长（默认 45s；里程碑 5min） */
  ttl?: number;
}

/** 规则评估（无门控；一次性里程碑在这里记账） */
function evaluate(eng: GameEngine, opts: InsightOpts, now: number): Cand[] {
  const cands: Cand[] = [];
  if (!eng) return cands;

  // —— ① 世界大战（最高优先：全屏级事件；worldWar 为 WorldWarState，持续年数按开战年份推算） ——
  const ww = eng.worldWar;
  if (ww && ww.phase === 'running') {
    const years = Math.max(1, Math.floor(eng.yearF - ww.startYear));
    cands.push({
      id: 'ww', icon: 'swords', tone: 'danger', prio: 100, cd: 150_000,
      title: '终极世界大战进行中',
      desc: `${ww.belligerents.length} 国卷入 · 已持续 ${years} 年 · 阵亡 ${ww.kills}`,
      actions: [
        { label: '王国榜', kind: 'panel', panel: 'kingdoms' },
        { label: '神谕推演战局', kind: 'oracle', prompt: '分析当前终极世界大战的战局走向：主要阵营、伤亡对比、可能的终局与转折点，并给出造物主可以做的 3 个干预选项。' },
      ],
    });
  }

  // —— 单遍单位扫描：感染数/野生种群/物种质心（多条规则共用） ——
  let infected = 0;
  let infX = 0, infY = 0;
  const wildPop = new Map<number, number>();
  const cX = new Map<number, number>(), cY = new Map<number, number>();
  for (const u of eng.units) {
    if (u.dead) continue;
    if (u.infected) { infected++; infX += u.x; infY += u.y; }
    const def = RACES[u.race];
    if (def && !def.isCiv) {
      wildPop.set(u.race, (wildPop.get(u.race) ?? 0) + 1);
      cX.set(u.race, (cX.get(u.race) ?? 0) + u.x);
      cY.set(u.race, (cY.get(u.race) ?? 0) + u.y);
    }
  }

  // —— ② 大面积野火（≥10 处火点；质心全量采样） ——
  const fires = eng.fireSet.size;
  if (fires >= 10) {
    let fx = 0, fy = 0, fn = 0;
    for (const i of eng.fireSet) {
      fx += (i % W) * 8 + 4;
      fy += Math.floor(i / W) * 8 + 4;
      fn++;
    }
    const cx = Math.round(fx / Math.max(1, fn)), cy = Math.round(fy / Math.max(1, fn));
    cands.push({
      id: 'fires', icon: 'flame', tone: 'danger', prio: 90, cd: 120_000,
      title: `野火蔓延 · ${fires} 处火点`,
      desc: '火势集中区域已形成连片燃烧，可能吞噬森林与聚落',
      actions: [
        { label: '天降甘霖', kind: 'divine', tool: 'rain_cloud', x: cx, y: cy },
        { label: '飞赴火场', kind: 'fly', x: cx, y: cy },
      ],
    });
  }

  // —— ③ 瘟疫（≥10 感染者） ——
  if (infected >= 10) {
    const cx = Math.round(infX / infected), cy = Math.round(infY / infected);
    cands.push({
      id: 'plague', icon: 'biohazard', tone: 'danger', prio: 85, cd: 150_000,
      title: `瘟疫肆虐 · ${infected} 名感染者`,
      desc: '疫病正在种群间扩散，濒死者在痛苦中传播病原',
      actions: [
        { label: '神恩净化', kind: 'divine', tool: 'heal', x: cx, y: cy },
        { label: '飞赴疫区', kind: 'fly', x: cx, y: cy },
      ],
    });
  }

  // —— ④ 生灵饱和（逼近引擎上限） ——
  if (eng.units.length > MAX_UNITS * 0.9) {
    cands.push({
      id: 'crowd', icon: 'users', tone: 'warn', prio: 80, cd: 300_000,
      title: '生灵趋于饱和',
      desc: `世界承载 ${eng.units.length}/${MAX_UNITS}——新生将逐渐稀少，大规模天灾可能引发清理`,
      actions: [
        { label: '降速观察', kind: 'speed', speed: 1 },
        { label: '生态面板', kind: 'panel', panel: 'eco' },
      ],
    });
  }

  // —— ⑤ 饥荒之云 ——
  const famine = eng.effects.find((e) => e.kind === 'famine');
  if (famine) {
    cands.push({
      id: 'famine', icon: 'cloudrain', tone: 'warn', prio: 75, cd: 180_000,
      title: '饥荒之云笼罩',
      desc: '灰云过境之处作物枯萎，饿殍渐现——文明将陷入动荡',
      actions: [
        { label: '飞赴灾区', kind: 'fly', x: famine.x, y: famine.y },
        { label: '自然面板', kind: 'panel', panel: 'nature' },
      ],
    });
  }

  // —— ⑥ 物种濒危（野生 ≤6 只，取最稀） ——
  let endRace = -1, endPop = 99;
  for (const [r, p] of wildPop) if (p > 0 && p < endPop) { endRace = r; endPop = p; }
  if (endRace >= 0 && endPop <= 6) {
    const name = RACES[endRace]?.name ?? '未知物种';
    const cx = Math.round(cX.get(endRace)! / endPop), cy = Math.round(cY.get(endRace)! / endPop);
    cands.push({
      id: `endangered:${endRace}`, icon: 'pawprint', tone: 'warn', prio: 70, cd: 240_000,
      title: `「${name}」濒临灭绝`,
      desc: `全世界仅剩 ${endPop} 只——一次天灾或几头捕食者就能终结这个物种`,
      actions: [
        { label: '神恩祝福', kind: 'divine', tool: 'bless', x: cx, y: cy },
        { label: '飞赴种群', kind: 'fly', x: cx, y: cy },
        { label: '生态面板', kind: 'panel', panel: 'eco' },
      ],
    });
  }

  // —— ⑦ 外交剑拔弩张（关系 < -55 且未开战） ——
  const civs = eng.civs.filter((c) => c.alive);
  let tension: { a: string; b: string; v: number } | null = null;
  for (let i = 0; i < civs.length; i++) {
    for (let j = i + 1; j < civs.length; j++) {
      if (eng.atWar(civs[i].id, civs[j].id)) continue;
      const v = eng.raceRelOf(civs[i].race, civs[j].race);
      if (v < -55 && (!tension || v < tension.v)) tension = { a: civs[i].name, b: civs[j].name, v };
    }
  }
  if (tension) {
    cands.push({
      id: 'tension', icon: 'handshake', tone: 'info', prio: 65, cd: 240_000,
      title: '外交剑拔弩张',
      desc: `「${tension.a}」与「${tension.b}」关系恶化（${tension.v}）——战争一触即发`,
      actions: [
        { label: '王国榜', kind: 'panel', panel: 'kingdoms' },
        { label: '神谕斡旋', kind: 'oracle', prompt: `「${tension.a}」与「${tension.b}」关系恶化到 ${tension.v}，战争一触即发。分析两国矛盾根源（领土/种族/宿怨），并尝试外交调解（diplomacy_control）：宣告停战或改善关系，汇报结果。` },
      ],
    });
  }

  // —— ⑧ 王国崛起里程碑（人口 ≥ 100，一次性，粘滞 5min） ——
  for (const c of civs) {
    if ((c.pop ?? 0) >= 100 && !milestone.has(`rise:${c.id}`)) {
      milestone.add(`rise:${c.id}`);
      const info = eng.getCivInfo(c.id);
      cands.push({
        id: `rise:${c.id}`, icon: 'crown', tone: 'good', prio: 55, cd: 0, ttl: 300_000,
        title: `「${c.name}」王国崛起`,
        desc: `人口突破 ${c.pop}，领土 ${info?.tiles ?? '?'} 格——新的强权正在成形`,
        actions: [
          { label: '飞赴首都', kind: 'fly', x: info?.capitalPos?.x, y: info?.capitalPos?.y },
          { label: '文明详情', kind: 'civ', civId: c.id },
        ],
      });
      break; // 单轮至多一条里程碑
    }
  }

  // —— ⑨ 科技突破（15 / 25 项，一次性，粘滞 5min） ——
  for (const c of civs) {
    const n = c.techs?.length ?? 0;
    const hit = n >= 25 ? 25 : n >= 15 ? 15 : 0;
    if (hit && !milestone.has(`tech:${c.id}:${hit}`)) {
      milestone.add(`tech:${c.id}:${hit}`);
      const info = eng.getCivInfo(c.id);
      cands.push({
        id: `tech:${c.id}:${hit}`, icon: 'lightbulb', tone: 'good', prio: 50, cd: 0, ttl: 300_000,
        title: `「${c.name}」科技突破`,
        desc: `已掌握 ${n} 项科技${hit === 25 ? '，逼近时代之巅' : '，步入繁荣纪元'}`,
        actions: [
          { label: '科技社会', kind: 'civ', civId: c.id },
          { label: '飞赴首都', kind: 'fly', x: info?.capitalPos?.x, y: info?.capitalPos?.y },
        ],
      });
      break;
    }
  }

  // —— ⑩ 新物种诞生（动态物种数增加，一次性，粘滞 5min） ——
  const dyn = eng.dynRaces.size;
  if (lastDynSpecies < 0) lastDynSpecies = dyn; // 首轮只记基线
  else if (dyn > lastDynSpecies) {
    lastDynSpecies = dyn;
    cands.push({
      id: `species:${dyn}`, icon: 'dna', tone: 'good', prio: 45, cd: 0, ttl: 300_000,
      title: '新物种诞生',
      desc: `世界自行演化出第 ${dyn} 个新物种——演化图谱又添一枝`,
      actions: [
        { label: '演化图谱', kind: 'panel', panel: 'evo' },
        { label: '纪事回顾', kind: 'panel', panel: 'chronicle' },
      ],
    });
  }

  // —— ⑪ 神经进化进行中（接入 61-a NeuroEvolution） ——
  const nevo = nevoSnapshot();
  if (nevo.enabled && nevo.topRace && nevo.topRace.gen >= 3) {
    cands.push({
      id: 'nevo', icon: 'brain', tone: 'info', prio: 40, cd: 240_000,
      title: '神经进化进行中',
      desc: `「${nevo.topRace.name}」的大脑已演化 ${nevo.topRace.gen} 代——生死考验正在塑造它的勇气与警觉`,
      actions: [{ label: '神经核心面板', kind: 'panel', panel: 'neuro' }],
    });
  }

  // —— ⑫ 强风暴登陆 ——
  const storm = eng.nature.storms.find((st) => st.landed && st.strength >= 1.1);
  if (storm) {
    cands.push({
      id: 'storm', icon: 'tornado', tone: 'warn', prio: 38, cd: 180_000,
      title: `强风暴「${storm.name}」登陆`,
      desc: '狂风撕扯海岸，建筑与船只都暴露在风暴路径上',
      actions: [
        { label: '飞赴风暴', kind: 'fly', x: storm.x * 8, y: storm.y * 8 },
        { label: '自然面板', kind: 'panel', panel: 'nature' },
      ],
    });
  }

  // —— ⑬ 闲置陪伴（用户 ≥2 分钟无操作；提示轮换由冷却驱动） ——
  if ((opts.idleMs ?? 0) > 120_000) {
    const cd = 300_000;
    const t = cooldown.get('idle') ?? 0;
    if (now >= t) {
      cooldown.set('idle', now + cd);
      cands.push({
        id: 'idle', icon: 'sparkles', tone: 'info', prio: 20, cd,
        title: '世界正在自行演化',
        desc: IDLE_TIPS[idleTipIdx++ % IDLE_TIPS.length],
        actions: [
          { label: '加速观察', kind: 'speed', speed: 3 },
          { label: '问神谕', kind: 'oracle', prompt: '这个世界最近发生了什么有趣的事？挑一件最有戏剧性的讲给我听，并给一个值得我亲自下场干预的建议。' },
        ],
      });
    }
  }

  return cands;
}

/** 主入口：全量体检 → 洞察列表（按优先级降序，至多 5 条；fresh 标记驱动徽标） */
export function collectInsights(eng: GameEngine, opts: InsightOpts = {}): Insight[] {
  const now = opts.now ?? Date.now();
  const cands = evaluate(eng, opts, now);
  const ids = new Set(cands.map((c) => c.id));

  // 常驻表迁移：条件已消失且过宽限 → 移除
  const next = new Map(active);
  for (const [id, entry] of next) {
    if (!ids.has(id) && now > entry.until) next.delete(id);
  }

  const out: Insight[] = [];
  for (const c of cands) {
    const prev = next.get(c.id);
    let fresh = false;
    if (!prev) {
      // 冷却门：同 id 结束后重新出现，须过冷却才算「新」（驱动徽标）
      const t = cooldown.get(c.id) ?? 0;
      fresh = now >= t;
      if (fresh) cooldown.set(c.id, now + c.cd);
    }
    next.set(c.id, { ins: { ...c, fresh }, until: now + (c.ttl ?? 45_000) });
    out.push({ ...c, fresh });
  }
  // 宽限期内的旧洞察继续服役（条件瞬时抖动不掉帧）
  for (const [id, entry] of next) {
    if (!ids.has(id) && now <= entry.until) out.push({ ...entry.ins, fresh: false });
  }

  active.clear();
  for (const [k, v] of next) active.set(k, v);
  out.sort((a, b) => b.prio - a.prio);
  return out.slice(0, 5);
}
