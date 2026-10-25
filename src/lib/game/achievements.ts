// ============ 成就系统：跨世界元进度（localStorage 持久化，WorldBox 式成就墙） ============
// 检测在引擎侧（achievementsTick 每 600 tick 评估一次），解锁即纪事播报 + 面板亮灯
import type { GameEngine } from './engine';
import { R } from './types';

/** 成就稀有度 */
export type AchTier = 'bronze' | 'silver' | 'gold' | 'legend';

export interface AchievementDef {
  id: string;
  /** 成就名 */
  name: string;
  /** 描述（解锁条件） */
  desc: string;
  tier: AchTier;
  /** 图标键（UI 侧映射 lucide 图标） */
  icon: string;
  /** 解锁条件（引擎侧评估；未解锁时每 600 tick 重评） */
  check: (e: GameEngine) => boolean;
  /** 进度（未解锁时展示：当前值/目标值） */
  progress?: (e: GameEngine) => number;
  /** 进度目标（progress 达到此值即满） */
  goal?: number;
}

/** 四档稀有度样式（UI 侧使用） */
export const TIER_META: Record<AchTier, { label: string; cls: string; ring: string }> = {
  bronze: { label: '青铜', cls: 'border-orange-600/60 bg-orange-600/10 text-orange-300', ring: 'ring-orange-500/30' },
  silver: { label: '白银', cls: 'border-zinc-400/60 bg-zinc-400/10 text-zinc-300', ring: 'ring-zinc-300/30' },
  gold: { label: '黄金', cls: 'border-yellow-400/60 bg-yellow-400/10 text-yellow-300', ring: 'ring-yellow-300/40' },
  legend: { label: '传说', cls: 'border-fuchsia-400/60 bg-fuchsia-400/10 text-fuchsia-300', ring: 'ring-fuchsia-400/40' },
};

/** 27 项成就（文明/战争/科技/传奇/天灾/进化/季节七大类） */
export const ACHIEVEMENTS: AchievementDef[] = [
  // —— 文明史诗 ——
  {
    id: 'first-civ', name: '创世纪', desc: '见证第一个王国的建立', tier: 'bronze', icon: 'flag',
    check: (e) => e.civs.some((c) => c.alive),
    progress: (e) => e.civs.filter((c) => c.alive).length, goal: 1,
  },
  {
    id: 'five-civs', name: '列国并起', desc: '同时存在 5 个王国', tier: 'silver', icon: 'castle',
    check: (e) => e.civs.filter((c) => c.alive).length >= 5,
    progress: (e) => e.civs.filter((c) => c.alive).length, goal: 5,
  },
  {
    id: 'pop-500', name: '人丁兴旺', desc: '世界文明人口达到 500', tier: 'silver', icon: 'users',
    check: (e) => e.units.filter((u) => !u.dead && (u.civ ?? -1) >= 0).length >= 500,
    progress: (e) => e.units.filter((u) => !u.dead && (u.civ ?? -1) >= 0).length, goal: 500,
  },
  {
    id: 'pop-2000', name: '熙攘大陆', desc: '世界文明人口达到 2000', tier: 'gold', icon: 'users',
    check: (e) => e.units.filter((u) => !u.dead && (u.civ ?? -1) >= 0).length >= 2000,
    progress: (e) => e.units.filter((u) => !u.dead && (u.civ ?? -1) >= 0).length, goal: 2000,
  },
  {
    id: 'unify', name: '天下一统', desc: '一个王国征服整个已知世界', tier: 'legend', icon: 'crown',
    check: (e) => e.civs.filter((c) => c.alive).length === 1 && e.civs.length >= 2,
  },
  {
    id: 'dead-world', name: '寂静之地', desc: '世界生灵全部消亡（文明存在过）', tier: 'silver', icon: 'skull',
    check: (e) => e.units.filter((u) => !u.dead).length === 0 && e.civs.length > 0,
  },
  // —— 战争风云 ——
  {
    id: 'first-war', name: '兵戈初鸣', desc: '第一次战争爆发', tier: 'bronze', icon: 'swords',
    check: (e) => e.statWars >= 1, progress: (e) => e.statWars, goal: 1,
  },
  {
    id: 'wars-10', name: '烽火连天', desc: '这个世界累计爆发 10 场战争', tier: 'silver', icon: 'swords',
    check: (e) => e.statWars >= 10, progress: (e) => e.statWars, goal: 10,
  },
  {
    id: 'civ-fallen', name: '王国陨落', desc: '一个王国从地图上消失', tier: 'bronze', icon: 'skull',
    check: (e) => e.statCivsFallen >= 1, progress: (e) => e.statCivsFallen, goal: 1,
  },
  {
    id: 'civ-fallen-5', name: '王朝更替', desc: '累计 5 个王国消亡', tier: 'gold', icon: 'crown',
    check: (e) => e.statCivsFallen >= 5, progress: (e) => e.statCivsFallen, goal: 5,
  },
  {
    id: 'legion-300', name: '百战军团', desc: '一支军团累计击杀 300 名敌军', tier: 'gold', icon: 'flag',
    check: (e) => e.armies.some((a) => a.kills >= 300),
  },
  // —— 科技纪元 ——
  {
    id: 'first-tech', name: '火种', desc: '第一个科技研究完成', tier: 'bronze', icon: 'lightbulb',
    check: (e) => e.civs.some((c) => (c.techs?.length ?? 0) >= 1),
  },
  {
    id: 'bronze-age', name: '青铜时代', desc: '有王国进入青铜军备时代', tier: 'bronze', icon: 'sword',
    check: (e) => e.civs.some((c) => (c.techs?.includes('bronze') ?? false)),
  },
  {
    id: 'ten-techs', name: '学术中心', desc: '单一王国完成 10 项科技', tier: 'silver', icon: 'scroll',
    check: (e) => e.civs.some((c) => (c.techs?.length ?? 0) >= 10),
    progress: (e) => Math.max(0, ...e.civs.map((c) => c.techs?.length ?? 0)), goal: 10,
  },
  {
    id: 'gothic', name: '哥特尖塔', desc: '有王国建成哥特庄园时代', tier: 'gold', icon: 'landmark',
    check: (e) => e.civs.some((c) => (c.techs?.includes('gothic') ?? false)),
  },
  {
    id: 'empire', name: '帝国诞生', desc: '一个王国演变为帝国政体', tier: 'gold', icon: 'crown',
    check: (e) => e.civs.some((c) => (c.gov ?? 0) >= 4),
  },
  // —— 传奇生物 ——
  {
    id: 'dragon-slayer', name: '屠龙者', desc: '一头巨龙被凡人斩落', tier: 'gold', icon: 'flame',
    check: (e) => e.statDragonsSlain >= 1, progress: (e) => e.statDragonsSlain, goal: 1,
  },
  {
    id: 'zombie-tide', name: '末日疫情', desc: '同时 40 个僵尸游荡', tier: 'silver', icon: 'biohazard',
    check: (e) => e.units.filter((u) => !u.dead && u.race === R.ZOMBIE).length >= 40,
    progress: (e) => e.units.filter((u) => !u.dead && u.race === R.ZOMBIE).length, goal: 40,
  },
  {
    id: 'firefighter', name: '消防队长', desc: '国民累计扑灭 50 处火情', tier: 'bronze', icon: 'droplets',
    check: (e) => e.firesOut >= 50, progress: (e) => e.firesOut, goal: 50,
  },
  {
    id: 'rebuilder', name: '重建家园', desc: '国民累计修复 30 栋受损建筑', tier: 'bronze', icon: 'hammer',
    check: (e) => e.repairsDone >= 30, progress: (e) => e.repairsDone, goal: 30,
  },
  // —— 天灾炼狱 ——
  {
    id: 'nuke-user', name: '蘑菇云升起', desc: '投下一枚核弹', tier: 'silver', icon: 'radiation',
    check: (e) => e.statNukes >= 1, progress: (e) => e.statNukes, goal: 1,
  },
  {
    id: 'blackhole-user', name: '事件视界', desc: '制造一个黑洞', tier: 'gold', icon: 'orbit',
    check: (e) => e.statBlackholes >= 1, progress: (e) => e.statBlackholes, goal: 1,
  },
  {
    id: 'meteor-shower-user', name: '流星如愿', desc: '召唤一场陨石雨', tier: 'bronze', icon: 'sparkles',
    check: (e) => e.statMeteorShowers >= 1, progress: (e) => e.statMeteorShowers, goal: 1,
  },
  // —— 进化之诗 ——
  {
    id: 'first-evolve', name: '自然选择', desc: '一个物种棘轮进化出新世代', tier: 'bronze', icon: 'dna',
    check: (e) => [...e.speciesBase.values()].some((b) => b.gen >= 1),
  },
  {
    id: 'evolve-3', name: '物种起源', desc: '任一物种累计进化 3 个世代', tier: 'gold', icon: 'dna',
    check: (e) => [...e.speciesBase.values()].some((b) => b.gen >= 3),
    progress: (e) => Math.max(0, ...[...e.speciesBase.values()].map((b) => b.gen), 0), goal: 3,
  },
  // —— 联盟与种族（Task 32）——
  {
    id: 'first-pact', name: '攻守同盟', desc: '两个王国缔结第一个联盟', tier: 'bronze', icon: 'handshake',
    check: (e) => e.alliances.length >= 1,
  },
  {
    id: 'grand-coalition', name: '大同盟', desc: '一个联盟聚集 5 个成员国', tier: 'gold', icon: 'handshake',
    check: (e) => e.alliances.some((al) => al.members.length >= 5),
    progress: (e) => Math.max(0, ...e.alliances.map((al) => al.members.length), 0), goal: 5,
  },
  // —— 季节 × 万物（Task 93）——
  {
    id: 'four-seasons', name: '四季轮回', desc: '见证一轮完整的春夏秋冬（八年一轮）', tier: 'gold', icon: 'sun',
    check: (e) => e.laws.seasons && e.yearF >= 8,
    progress: (e) => (e.laws.seasons ? e.yearF : 0), goal: 8,
  },
  {
    id: 'necro-court', name: '白骨朝廷', desc: '巫妖麾下的骷髅军团达到 15 名', tier: 'silver', icon: 'ghost',
    check: (e) => e.units.some((l) => !l.dead && l.race === R.LICH) && e.units.filter((u) => !u.dead && u.race === R.SKELETON).length >= 15,
    progress: (e) => (e.units.some((l) => !l.dead && l.race === R.LICH) ? e.units.filter((u) => !u.dead && u.race === R.SKELETON).length : 0), goal: 15,
  },
  {
    id: 'summer-wildfire', name: '盛夏燎原', desc: '夏季一场野火同时蔓延 40 个地块', tier: 'bronze', icon: 'flame',
    check: (e) => e.nature.season === 1 && e.fireSet.size >= 40,
    progress: (e) => (e.nature.season === 1 ? e.fireSet.size : 0), goal: 40,
  },
];

/** 评估全部未解锁成就（引擎每 600 tick 调用一次） */
export function checkAchievements(e: GameEngine): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (e.achUnlocked.has(a.id)) continue;
    if (a.check(e)) out.push(a);
  }
  return out;
}
