// ============ S-A 系统时序显式清单（Unity 对齐 WorldBox · docs/UNITY_ALIGNMENT.md） ============
// 本文件是引擎 tick() 的「施工图」：SYSTEM_REGISTRY 按实际执行序逐项声明每个模拟子系统，
// 与 src/lib/game/engine.ts 的 tick() 方法体一一同序（scripts/check-system-sequence.mjs 自动对账）。
// —— 消费端：① S-D WASM 化优先级（按 every/port 列排序）② DevPanel「系统时序」实时视图
//    ③ 新子系统的插入点决策（见 tick() 头注释的插入规则）。
// —— 维护纪律：tick() 内新增/删改子系统调用时，必须同步维护本清单（对账脚本会拦截漂移）。

/** 移植状态：JS = 纯 TypeScript；WASM = rust-core 批内核；混合 = WASM 主路径 + JS 接力/镜像 */
export type SysPort = 'JS' | 'WASM' | '混合';

/** 语义组 id */
export type SysGroup =
  | 'core' | 'disaster' | 'sim' | 'civ' | 'fx'
  | 'eco' | 'nature' | 'deep' | 'race' | 'meta';

export interface SystemEntry {
  /** 方法名（引擎内调用名；内联步骤无括号） */
  name: string;
  /** 调度周期：tickCount % every === offset 时执行；1 = 每 tick */
  every: number;
  /** 触发余数（同周期多子系统靠 offset 错峰，互不挤压同帧） */
  offset: number;
  group: SysGroup;
  /** 移植状态（S-D 施工依据） */
  port: SysPort;
  /** 职责一句话 */
  desc: string;
  /** 内联步骤（非方法调用，对账脚本跳过） */
  inline?: boolean;
  /** 事件驱动条件（every=1 但有额外门控） */
  cond?: string;
}

export const GROUP_META: Record<SysGroup, { name: string; color: string; desc: string }> = {
  core:     { name: '历法与插值',    color: 'text-sky-400',    desc: '渲染插值基准与世界历法推进' },
  disaster: { name: '灾害物理',      color: 'text-red-400',    desc: '火势蔓延与辐射沉降' },
  sim:      { name: '空间索引·批内核', color: 'text-emerald-400', desc: '敌我空间桶 + WASM 单位批处理（引擎心脏）' },
  civ:      { name: '文明与战争',    color: 'text-purple-400', desc: '王国/经济/科技/军团/外交/战争全家族' },
  fx:       { name: '特效与痕迹',    color: 'text-fuchsia-400', desc: '粒子特效/血迹尸骸/脚印/震屏' },
  eco:      { name: '生态与演化',    color: 'text-lime-400',   desc: '承载力竞争与种群基因演化' },
  nature:   { name: '自然引擎',      color: 'text-teal-400',   desc: '大气/风暴/水文/季节/地质/板块' },
  deep:     { name: '深时引擎',      color: 'text-blue-400',   desc: '洋流/温度场/冰川/海岸/群系漂移' },
  race:     { name: '种族引擎通道',  color: 'text-amber-400',  desc: '特殊种族的引擎级通道（批内核之外的纯 TS 增益）' },
  meta:     { name: '法则·统计·剖析', color: 'text-zinc-400',   desc: '触发器/存档采样/成就/Agent 法则/性能剖析' },
};

/** tick() 实际执行序（与 engine.ts tick() 方法体逐行同序；对账脚本守护） */
export const SYSTEM_REGISTRY: readonly SystemEntry[] = [
  // —— P0 历法与插值（内联） ——
  { name: '插值快照 lx/ly', every: 1, offset: 0, group: 'core', port: 'JS', desc: '单位+军旗位置快照，渲染帧间插值（WorldBox 式丝滑移动）', inline: true },
  { name: 'yearF 历法推进', every: 1, offset: 0, group: 'core', port: 'JS', desc: '世界年推进 1/YEAR_TICKS', inline: true },
  // —— P1 灾害物理 ——
  { name: 'fireTick', every: 1, offset: 0, group: 'disaster', port: 'JS', desc: '火势蔓延/熄灭/引燃邻格' },
  // —— P2 空间索引与批内核（引擎心脏） ——
  { name: 'rebuildBuckets', every: 1, offset: 0, group: 'sim', port: '混合', desc: '空间桶世代戳懒清空重建；批内核未就绪时兼做 Stage1 扫描镜像打包' },
  { name: 'unitsTick', every: 1, offset: 0, group: 'sim', port: '混合', desc: 'Rust 批内核 Stage2 接管（updateUnit/moveUnit/战斗/AI/繁衍）；稀疏路径 bail → JS 接力 → 续批' },
  // —— P3 文明与战争（低频错峰群） ——
  { name: 'panicTick', every: 60, offset: 0, group: 'civ', port: 'JS', desc: '恐慌雪崩监测（峰值统计+雪崩事件）' },
  { name: 'rebuildCivBuildCounts', every: 5, offset: 0, group: 'civ', port: 'JS', desc: '王国建筑计数重建（civsTick 前置依赖）' },
  { name: 'civsTick', every: 5, offset: 0, group: 'civ', port: 'JS', desc: '文明扩张/建城/人口推进' },
  { name: 'effectsTick', every: 1, offset: 0, group: 'fx', port: 'JS', desc: '粒子特效推进（心形/伤害数字/神力视效）' },
  { name: 'radTick', every: 30, offset: 0, group: 'disaster', port: 'JS', desc: '辐射沉降衰减与污染扩散' },
  { name: 'frontTick', every: 30, offset: 0, group: 'civ', port: 'JS', desc: '动态战线周期结算（衰减/反攻/收复）' },
  { name: 'economyTick', every: 120, offset: 0, group: 'civ', port: 'JS', desc: '经济：集市/图书馆产出' },
  { name: 'tradeTick', every: 40, offset: 0, group: 'civ', port: 'JS', desc: '国际贸易：市场驱动商队调度' },
  { name: 'defenseTick', every: 10, offset: 0, group: 'civ', port: 'JS', desc: '防御建筑：箭塔/城堡射击' },
  { name: 'templeTick', every: 120, offset: 0, group: 'civ', port: 'JS', desc: '神殿治疗' },
  { name: 'barracksTick', every: 200, offset: 0, group: 'civ', port: 'JS', desc: '兵营训练' },
  { name: 'banditRaidTick', every: 900, offset: 0, group: 'civ', port: 'JS', desc: '世界法则事件：强盗袭击（22.5 年）' },
  { name: 'dragonSpawnTick', every: 3000, offset: 0, group: 'civ', port: 'JS', desc: '世界法则事件：巨龙降临（75 年）' },
  { name: 'regrowTick', every: 60, offset: 0, group: 'nature', port: 'JS', desc: '植被再生' },
  { name: 'statsTick', every: 60, offset: 0, group: 'meta', port: 'JS', desc: '世界统计聚合' },
  { name: 'checkTriggers', every: 8, offset: 0, group: 'meta', port: 'JS', desc: '玩家触发器条件评估（神谕触机）' },
  { name: 'decalsTick', every: 2, offset: 0, group: 'fx', port: 'JS', desc: '血迹/尸骸 decals 老化淡出' },
  { name: 'fpTick', every: 2, offset: 0, group: 'fx', port: 'JS', desc: '脚印采样（确定性条件零 RNG）' },
  { name: 'iceTick', every: 40, offset: 0, group: 'nature', port: 'JS', desc: '冰面生态：消融/极地冻结/海啸退潮/湿沙干透' },
  { name: 'snowmanTick', every: 80, offset: 16, group: 'nature', port: 'JS', desc: '冬季雪人：村民堆雪人/出冬渐融（与 iceTick 错峰）' },
  { name: 'historyTick', every: 200, offset: 0, group: 'meta', port: 'JS', desc: '文明兴衰历史采样（人口/领土/房屋曲线）' },
  { name: 'victoryTick', every: 150, offset: 0, group: 'civ', port: 'JS', desc: '胜利条件评估' },
  { name: 'warTick', every: 200, offset: 0, group: 'civ', port: 'JS', desc: '战争体系：分数结算/割地/亡乏' },
  { name: 'worldWarTick', every: 30, offset: 0, group: 'civ', port: 'JS', desc: '终极世界大战：终局判定/停战到期/现代武器部署' },
  { name: 'armyTick', every: 5, offset: 0, group: 'civ', port: 'JS', desc: '军团方阵状态机（集结/行军/会战/围城/溃退）' },
  { name: 'warInfoTick', every: 100, offset: 0, group: 'civ', port: 'JS', desc: '战争情报面板刷新' },
  { name: 'directiveTick', every: 30, offset: 0, group: 'civ', port: 'JS', desc: '文明旨意：进度评估/成功/失败' },
  { name: 'techTick', every: 120, offset: 5, group: 'civ', port: 'JS', desc: '科技研发：选题/投入/完成（与经济错峰）' },
  { name: 'societyTick', every: 150, offset: 7, group: 'civ', port: 'JS', desc: '社会体系：稳定度/文化/军国主义/政体演变' },
  { name: 'allianceTick', every: 300, offset: 23, group: 'civ', port: 'JS', desc: '联盟：结盟/扩员/凝聚力/经济互助/种族关系漂移' },
  { name: 'armoryTick', every: 240, offset: 13, group: 'civ', port: 'JS', desc: '军备工坊：科技军备等级→自动武装国民' },
  // —— P4 生态与演化 ——
  { name: 'ecoTick', every: 120, offset: 9, group: 'eco', port: 'JS', desc: '生态竞争：植被/食草/食肉承载力与竞争性饥饿' },
  { name: 'evolutionTick', every: 600, offset: 11, group: 'eco', port: 'JS', desc: '生物进化：种群基因均值→棘轮推进与亚种播报' },
  { name: 'sampleHistory', every: 300, offset: 17, group: 'meta', port: 'JS', desc: '种群历史采样（生态面板曲线）' },
  { name: 'achievementsTick', every: 600, offset: 19, group: 'meta', port: 'JS', desc: '成就评估：解锁+进度缓存' },
  // —— P5 自然引擎 ——
  { name: 'nature.atmTick', every: 10, offset: 3, group: 'nature', port: 'JS', desc: '大气环流：蒸发/平流/云雨/雨影' },
  { name: 'nature.stormTick', every: 40, offset: 5, group: 'nature', port: 'JS', desc: '风暴生命周期+气候型天灾' },
  { name: 'nature.hydroTick', every: 120, offset: 9, group: 'nature', port: 'JS', desc: '水文：丰沛降雨山地汇流成新河（大气→地貌因果链）' },
  { name: 'nature.seasonCheck', every: 40, offset: 0, group: 'nature', port: 'JS', desc: '季节轮转检测（换季全图色调刷新）' },
  { name: 'nature.tectonicTick', every: 240, offset: 21, group: 'nature', port: 'JS', desc: '板块构造：应力积累/地震释放/热点增压' },
  { name: 'nature.geologyTick', every: 600, offset: 31, group: 'nature', port: 'JS', desc: '地质演变：造山/侵蚀/沉积/火山喷发/裂谷' },
  // —— P6 种族引擎通道 + 深时 ——
  { name: 'worldsim.oceanTick', every: 120, offset: 15, group: 'deep', port: 'JS', desc: '洋流环流：风应力+科氏 Jacobi 流函数→西向强化暖流' },
  { name: 'angelAuraTick', every: 3, offset: 0, group: 'race', port: 'JS', desc: '天使光环：和平单位治愈（纯 TS 增益无需 rust 镜像）' },
  { name: 'phoenixAshTick', every: 1, offset: 0, group: 'race', port: 'JS', desc: '凤凰涅槃：灰烬倒数到点重生', cond: '仅灰烬队列非空' },
  { name: 'entGroveTick', every: 10, offset: 0, group: 'race', port: 'JS', desc: '树人播种：植树/灭火（纯地形操作）' },
  { name: 'lichRaiseTick', every: 12, offset: 0, group: 'race', port: 'JS', desc: '巫妖死灵复生（寒冬死潮加速 12→8 tick——季节门控）' },
  { name: 'hydraRegenTick', every: 30, offset: 0, group: 'race', port: 'JS', desc: '九头蛇再生' },
  { name: 'beachedAquaticTick', every: 1, offset: 0, group: 'race', port: 'JS', desc: '水生搁浅整治（和平单位被内核接管，救援必须在通道层）' },
  { name: 'wildlifeReboundTick', every: 600, offset: 61, group: 'race', port: 'JS', desc: '百兽迁徙：灭绝野生动物低频回归' },
  { name: 'predatorHuntTick', every: 20, offset: 7, group: 'race', port: 'JS', desc: '猎手扑杀：内核捕食者追不上猎物的能量链补环' },
  { name: 'sharkBreedTick', every: 240, offset: 13, group: 'race', port: 'JS', desc: '鲨群繁衍辅助：低种群地板机制（<8 启动）' },
  // —— P7 深时引擎 ——
  { name: 'worldsim.tempTick', every: 120, offset: 27, group: 'deep', port: 'JS', desc: '动态温度场：纬度+海拔+大陆度+灰烬+洋流异常耦合' },
  { name: 'worldsim.glacierTick', every: 240, offset: 33, group: 'deep', port: 'JS', desc: '冰川系统：积累/消融/进退（火山冬反馈环）' },
  { name: 'worldsim.hydroTick', every: 600, offset: 41, group: 'deep', port: 'JS', desc: '水力侵蚀与沉积：流向累加刻谷+泥沙成原（与地质错峰）' },
  { name: 'worldsim.coastTick', every: 600, offset: 47, group: 'deep', port: 'JS', desc: '海平面与海岸线进退（全球均温驱动，有主领土绕行）' },
  { name: 'worldsim.biomeTick', every: 600, offset: 53, group: 'deep', port: 'JS', desc: '群系漂移：气候期望持续错配才迁移' },
  // —— P8 法则与尾迹 ——
  { name: 'agentLaws.tick', every: 120, offset: 57, group: 'meta', port: '混合', desc: 'Agent 法则结算：神谕书写的活机制触发器×动作（Stage 3：可能改单位，保守收口）' },
  { name: 'shake 衰减', every: 1, offset: 0, group: 'fx', port: 'JS', desc: '震屏衰减 ×0.88', inline: true },
  { name: 'tick 剖析 EMA', every: 1, offset: 0, group: 'meta', port: 'JS', desc: 'tickMs/prof/uprof 指数滑动平均 + simUps 500ms 窗口结算', inline: true },
];

/** 语义组出现顺序（DevPanel 渲染序） */
export const GROUP_ORDER: readonly SysGroup[] = [
  'core', 'disaster', 'sim', 'civ', 'fx', 'eco', 'nature', 'race', 'deep', 'meta',
];

/** port 徽章样式（DevPanel 消费） */
export const PORT_STYLE: Record<SysPort, string> = {
  JS: 'border-zinc-700 text-zinc-500',
  WASM: 'border-emerald-600 text-emerald-400',
  '混合': 'border-amber-600 text-amber-400',
};

/** 按语义组取清单（保序） */
export function systemsByGroup(g: SysGroup): SystemEntry[] {
  return SYSTEM_REGISTRY.filter((s) => s.group === g);
}
