// ============ 世界模板（标题屏「重铸新世界」选项） ============
// 参数透传 worldgen.generateWorld(seed, params)——分布差异已经 42 轮实测标定：
// 盘古/群岛/冰河/沙海均有可感知的地貌与气候差异；classic 无参数 = 既往经典随机世界。
import type { WorldGenParams } from './worldgen';

export interface WorldTemplate {
  id: string;
  /** 模板名（中文，卡片主标题） */
  name: string;
  /** 一句话氛围短语（卡片副标题） */
  tagline: string;
  /** 选中后的详细描述（模板面板底部） */
  desc: string;
  /** 世界生成参数（undefined = 全缺省经典世界） */
  params?: WorldGenParams;
}

export const WORLD_TEMPLATES: WorldTemplate[] = [
  {
    id: 'classic',
    name: '经典随机',
    tagline: '万物之初，命运未卜',
    desc: '不施加任何意志的世界。海洋与大陆的比例交由骰子决定，一切皆有可能。',
  },
  {
    id: 'pangaea',
    name: '盘古大陆',
    tagline: '一块巨陆，四海环伺',
    desc: '洪荒巨陆自混沌中隆起，广袤的内陆适合文明繁衍扩张，而漫长的海岸线藏着远航的可能。',
    params: { seaBias: -0.06, falloff: 0.72 },
  },
  {
    id: 'archipelago',
    name: '千岛之海',
    tagline: '破碎星屑，散落碧波',
    desc: '大地被揉碎成千百座岛屿。每个孤岛都是独立的摇篮，海洋与航海将书写这里的史诗。',
    params: { seaBias: 0.05, warp: 1.8 },
  },
  {
    id: 'glacial',
    name: '冰河纪元',
    tagline: '白色荒原，坚韧者生',
    desc: '冰封千里的白色荒原，唯有赤道一线残存着灰绿冻土。文明的火种在永冬中艰难传递。',
    // -0.34 → -0.62 主 Agent 终调：雪线压过中纬直抵赤道带（雪原占陆地约 75-85%），
    // 赤道 core tempF ≈ 0.38±0.17 → 雪/草斑驳——「全境冰封、一线生机」的视觉承诺成立且保留可玩性
    params: { tempBias: -0.62 },
  },
  {
    id: 'dunes',
    name: '焦热沙海',
    tagline: '烈日灼沙，绿洲如金',
    desc: '赤日炙烤着无垠沙海，水比血更珍贵。围绕稀树草原与绿洲，生命在此展开最残酷的争夺。',
    params: { tempBias: 0.15, moistBias: -0.18 },
  },
  {
    id: 'jungle',
    name: '郁郁雨林',
    tagline: '湿热秘境，万物疯长',
    desc: '温暖潮湿的气息滋养着莽莽雨林，六座大湖如明镜散落。繁茂到过剩的生态里，进化从不眠。',
    params: { tempBias: 0.06, moistBias: 0.18, lakes: 6 },
  },
];

export const TEMPLATE_BY_ID: Record<string, WorldTemplate> = Object.fromEntries(
  WORLD_TEMPLATES.map((t) => [t.id, t]),
);
