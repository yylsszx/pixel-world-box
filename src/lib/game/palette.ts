// ============ 主调色板（#93 质感地基）—— 全项目唯一合法色源 ============
// 纪律（docs/世界盒质感打磨方案.md M1）：
//   1. sprites.ts / render.ts 之外的新代码禁止裸 hex 色值（eslint no-restricted-syntax 守护）；
//   2. 本表只做「命名收编」不做「改色」—— 既有视觉零变化；统一近似色（金色族四分身等）留待 M5；
//   3. TS 单源 → Unity 恢复迁移时由 WbRenderTables 机械镜像，禁止手抄。
// 既有 sprites.ts 内联色值在 M2-M5 各轮分批迁移到此，本轮先行收编：描边族/反馈族/草原五兽族。

import { TERRAIN_RGB, WATER_TIER_RGB, DEEP_TIER_RGB } from './constants';
import { T } from './types';

/** 描边与结构暗部 —— WorldBox 式 1px 轮廓的统一描边色（M2 全物种精灵以此为描边基准） */
export const OUTLINE = '#1a1613';

/** 主调色板：命名色常量（值 = 既有视觉原值，零改色收编） */
export const PAL = {
  // —— 描边/结构 ——
  outline: OUTLINE,
  ink: '#3a342c', // 通用深暗（腿/靴/暗部描边）
  inkDeep: '#14100c', // 最深黑（鼻尖/瞳）

  // —— 战斗/状态反馈 ——
  hurt: '#ff6b5e', // 受击红闪
  hurtDeep: '#cf3f2e', // 受击暗红/血
  hurtLight: '#ffc8b8', // 受击亮缘
  infected: '#b8e2b4', // 染疫绿
  infectedShade: '#9cc99a', // 染疫绿暗部

  // —— 羊毛族（绵羊）——
  wool: '#f2ead8',
  woolShade: '#d9cdb2',
  face: '#4a4640', // 深色羊脸/口鼻

  // —— 犬科族（狼/雪狼）—— 暖褐灰：与山岩中性灰（#7a7a7e）拉开色相（VLM 盲测校准）
  fur: '#7d7264',
  furShade: '#5c5347',
  furLight: '#94897a',
  furMark: '#3a342c', // 背纹
  snowFur: '#eef2f5',
  snowShade: '#d4dde4',
  snowMark: '#9aa8b4',

  // —— 熊族 ——
  bearFur: '#6e4a2b',
  bearShade: '#4a3018',
  bearLight: '#9a6f45',
  claw: '#e8e0d0',

  // —— 鹿族 ——
  deerFur: '#a5794f',
  deerShade: '#5b3d24',
  deerLight: '#d1a878',
  antler: '#8a6a42',
  rump: '#f2ead8', // 白臀斑/白尾

  // —— 眼睛 ——
  eyeLight: '#f7f9fb',
  eyeAmber: '#ffd93d',
  eyeIce: '#38bdf8',

  // —— 火族（爆炸/火焰/岩浆光）——
  fire: '#ff9b2d',
  fireBright: '#ffd93d',
  fireCore: '#fff3c4',
  fireDeep: '#cf3f2e',

  // —— 金族（王权/成就）——
  gold: '#ffd93d',
  goldDeep: '#c9a02a',
  goldCrown: '#e6ba6c',

  // —— 钢/木 ——
  steel: '#d9d9d9',
  steelDark: '#4a4038',
  wood: '#6e4a2b',
  woodLight: '#8a5c33',

  // —— 皮肤 ——
  skin: '#d9a066',
} as const;

export type PaletteKey = keyof typeof PAL;

/** 地形 12 色命名收编（索引语义 = T 枚举；引擎/烘焙仍走 TERRAIN_RGB 数组，此处供人读与 Unity 镜像） */
export const TERR_COLOR: Record<string, [number, number, number]> = {
  deep: TERRAIN_RGB[T.DEEP],
  water: TERRAIN_RGB[T.WATER],
  sand: TERRAIN_RGB[T.SAND],
  grass: TERRAIN_RGB[T.GRASS],
  forest: TERRAIN_RGB[T.FOREST],
  hill: TERRAIN_RGB[T.HILL],
  mountain: TERRAIN_RGB[T.MOUNTAIN],
  snow: TERRAIN_RGB[T.SNOW],
  lava: TERRAIN_RGB[T.LAVA],
  burnt: TERRAIN_RGB[T.BURNT],
  ice: TERRAIN_RGB[T.ICE],
  swamp: TERRAIN_RGB[T.SWAMP],
};

/** 水深 5 色命名收编（浅礁 → 近岸 → 海域 → 陆架 → 深渊） */
export const WATER_TIERS = {
  shallow: WATER_TIER_RGB[0],
  shore: WATER_TIER_RGB[1],
  open: WATER_TIER_RGB[2],
  shelf: DEEP_TIER_RGB[0],
  abyss: DEEP_TIER_RGB[1],
} as const;
