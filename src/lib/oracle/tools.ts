// ============ 神谕 Agent 工具目录（v2 · 开发者级 Harness） ============
// 纯数据目录（不 import 引擎）：描述 Agent 可调用的 66 个世界工具，按 L0-L6 七层组织
// （层层向上覆盖全游戏：世界内核 → 生命单位 → 文明王国 → 战争外交 → 神力天灾 → 机制热插拔 → 元控制）。
// 执行器：bridge.ts（23 个基础工具）+ bridge-ext.ts（扩展工具，default 分支委托 runExt）。
// 分层清单 TOOL_LAYERS 与下方注释分组必须一致（get_introspection 依赖它绘制能力地图）。

export interface ToolArgDef {
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'object';
  desc: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolDef {
  name: string;
  desc: string;
  args: Record<string, ToolArgDef>;
}

export const AGENT_TOOLS: ToolDef[] = [
  // ————————————————— L0 世界内核（地形/自然/深时/纪事/纪元） —————————————————
  {
    name: 'get_world_digest',
    desc: '世界全景实况：纪元、列国、战火、生态、自然、社会的一段式摘要',
    args: {},
  },
  {
    name: 'get_tile',
    desc: '地块详情：地形、气候、土壤肥力、海拔、冰川、领土归属、驻留单位（世界 256×160）',
    args: {
      x: { type: 'number', desc: 'x 坐标（0-255）', required: true },
      y: { type: 'number', desc: 'y 坐标（0-159）', required: true },
    },
  },
  {
    name: 'get_region',
    desc: '区域扫描：地形分布、单位统计、领土归属（radius 2-20）',
    args: {
      x: { type: 'number', desc: '中心 x 坐标', required: true },
      y: { type: 'number', desc: '中心 y 坐标', required: true },
      radius: { type: 'number', desc: '扫描半径 2-20', required: true },
    },
  },
  {
    name: 'get_nature',
    desc: '自然引擎实况：季节、风暴、板块应力、深时系统（侵蚀/洋流/冰川/海平面/群系漂移）',
    args: {},
  },
  {
    name: 'get_stats',
    desc: '世界统计快照（机制条件 DSL 同键集）：year/pop/wildlife/herbivores/predators/kingdoms/wars/panicking/feuds/families/globalTemp/seaLevel/glacierArea/soilAvg/wildRaces/fires + 机制自定义计数器',
    args: {},
  },
  {
    name: 'get_chronicle',
    desc: '纪事检索：按文本/事件类型/起始年份过滤世界纪事，最新优先（limit 默认 20 上限 60）',
    args: {
      query: { type: 'string', desc: '文本包含匹配（如王国名/「陨石」）' },
      kind: { type: 'string', desc: '事件类型精确过滤，如 war/fall/found/meteor/worldwar/oracle/emerge' },
      sinceYear: { type: 'number', desc: '起始年份（≥），省略不限' },
      limit: { type: 'number', desc: '条数，默认 20，最大 60' },
    },
  },
  {
    name: 'get_events',
    desc: '近期世界纪事（limit 默认 15 条上限 40）',
    args: { limit: { type: 'number', desc: '条数，默认 15，最大 40' } },
  },
  {
    name: 'terrain_paint',
    desc: '改造地形（笔刷式，radius 1-12）',
    args: {
      terrain: {
        type: 'string',
        desc: '目标地形',
        required: true,
        enum: ['water', 'deep', 'sand', 'grass', 'forest', 'hill', 'mountain', 'snow', 'burnt', 'lava', 'ice'],
      },
      x: { type: 'number', desc: '笔刷中心 x', required: true },
      y: { type: 'number', desc: '笔刷中心 y', required: true },
      radius: { type: 'number', desc: '笔刷半径 1-12', required: true },
    },
  },
  {
    name: 'era_control',
    desc: '纪元操控：modernize 全文明工业革命（蒸汽/枪炮/飞行/原子 8 项科技）/ transcend 未来革命（激光/蜂群/轨道/反物质）/ next_season 季节快进一档',
    args: {
      action: { type: 'string', desc: '纪元动作', required: true, enum: ['modernize', 'transcend', 'next_season'] },
    },
  },

  // ————————————————— L1 生命单位（生物/神经/演化/基因/个体改写） —————————————————
  {
    name: 'get_units',
    desc: '单位检索（可按种族/国家过滤，limit 默认 12 上限 30）',
    args: {
      race: { type: 'string', desc: '种族过滤（如 human/elf/orc/sheep/wolf/dragon）' },
      kingdom: { type: 'string', desc: '国家名过滤' },
      limit: { type: 'number', desc: '返回上限，默认 12，最大 30' },
    },
  },
  {
    name: 'get_unit',
    desc: '单个单位详情：属性、装备、神经、社会关系、家族',
    args: { id: { type: 'number', desc: '单位 id', required: true } },
  },
  {
    name: 'get_unit_brain',
    desc: '单位神经档案：属性 + NeuroCore 决策核心状态（战或逃策略源/分歧胜率）+ 瞬态神经字段（恐慌/脱离冷却/寒冻/祝福诅咒）+ 基因四维 + 血仇清单',
    args: { id: { type: 'number', desc: '单位 id', required: true } },
  },
  {
    name: 'get_neuro',
    desc: 'NeuroCore 神经决策与强化学习训练状态（战或逃头 PPO）',
    args: {},
  },
  {
    name: 'get_ecology',
    desc: '生态平衡态与各物种种群数量',
    args: {},
  },
  {
    name: 'get_races',
    desc: '种族名录：全部预设种族 + 动态种化物种（名/key/是否文明/是否捕食者/现存人口/演化代数）+ 种族关系矩阵摘要（偏离基线且双方存活的种族对，上限 20 对）',
    args: {},
  },
  {
    name: 'get_evo',
    desc: '演化图谱：五类涌现节点统计（物种/武器/科技/特质/理念，节点过多截最近 40 条）+ 动态物种清单（名/人口/代数）+ 涌现武器威力榜（按伤害前 12）',
    args: {},
  },
  {
    name: 'find_units',
    desc: '按名找角色：名字包含匹配，最多 10 条（找具体人物/英雄/国王用这个）',
    args: { name: { type: 'string', desc: '名字片段（包含匹配）', required: true } },
  },
  {
    name: 'search_units',
    desc: '单位高级筛选：种族/国家/击杀/生命/坐标圆域组合过滤（limit 默认 15 上限 40）',
    args: {
      race: { type: 'string', desc: '种族过滤（中文/英文均可）' },
      kingdom: { type: 'string', desc: '国家名过滤' },
      minKills: { type: 'number', desc: '最低击杀数' },
      minHp: { type: 'number', desc: '最低当前生命' },
      maxHp: { type: 'number', desc: '最高当前生命' },
      nearX: { type: 'number', desc: '坐标圆域中心 x（需与 nearY/nearR 同给）' },
      nearY: { type: 'number', desc: '坐标圆域中心 y' },
      nearR: { type: 'number', desc: '坐标圆域半径 1-60' },
      limit: { type: 'number', desc: '返回上限，默认 15，最大 40' },
    },
  },
  {
    name: 'spawn_creatures',
    desc: '生成既有生物（race 支持中文/英文种族名，如 人类/羊/狼/dragon；count 1-50）；缺省坐标=相机中心（造物主视野内）',
    args: {
      race: { type: 'string', desc: '种族名（中文或英文，如 人类/精灵/羊/狼/bear/dragon）', required: true },
      count: { type: 'number', desc: '数量 1-50' },
      x: { type: 'number', desc: '生成点 x（省略则相机中心）' },
      y: { type: 'number', desc: '生成点 y（省略则相机中心）' },
      radius: { type: 'number', desc: '散布半径 1-8，默认 2（首只精确落点）' },
    },
  },
  {
    name: 'spawn_species',
    desc: '物种创造（神谕造物 v5·全新设计非模板）：从零锻造全新物种——属性 hp/dmg/speed/repro/maxAge/cap 全显式自定（缺省按生态角色给合理值，绝不继承模板）；form 体形族系决定精灵构造；视觉基因组 11 参数可钦定外貌；predator 捕食者/敌视文明可逃；独立基因池可自行种化融合',
    args: {
      name: { type: 'string', desc: '新物种名（≤8 字，省略则自动命名）' },
      count: { type: 'number', desc: '降临数量 1-40，默认 6' },
      x: { type: 'number', desc: '降临点 x（省略则相机中心——造物主看得见）' },
      y: { type: 'number', desc: '降临点 y（省略则相机中心）' },
      form: { type: 'string', desc: '体形族系（决定精灵色板与身体构造）：person/sheep/wolf/bear/dragon/deer/penguin/camel/scorpion/snake/snowwolf/skeleton/demon/mage/troll/ogre/whitewalker/vampire/kraken/sandworm/basilisk；省略按角色随机；旧参 base 同义', enum: ['person', 'sheep', 'wolf', 'bear', 'dragon', 'deer', 'penguin', 'camel', 'scorpion', 'snake', 'snowwolf', 'skeleton', 'demon', 'mage', 'troll', 'ogre', 'whitewalker', 'vampire', 'kraken', 'sandworm', 'basilisk'] },
      wild: { type: 'boolean', desc: 'true 野生（默认）/ false 文明种族（可建国）' },
      predator: { type: 'boolean', desc: '捕食者（猎食其他野生动物；食草动物 predator:false+低 dmg）' },
      hostile: { type: 'boolean', desc: '是否敌视文明（无端攻击文明种族）' },
      hp: { type: 'number', desc: '生命 1-99999（缺省按角色：捕食 48/食草 24/中立 40/文明 62）' },
      dmg: { type: 'number', desc: '攻击 0-500（缺省按角色：捕食 12/食草 2/中立 6/文明 9）' },
      speed: { type: 'number', desc: '速度 0.005-0.3 格/tick（缺省 0.06-0.09）' },
      repro: { type: 'number', desc: '繁衍率 0-0.02（缺省 0.0028-0.0055）' },
      maxAge: { type: 'number', desc: '寿限 1-9999 年（缺省 24-65）' },
      cap: { type: 'number', desc: '野生种群上限 4-400（缺省：捕食 60/食草 140/中立 80）' },
      archetype: { type: 'string', desc: '种族原型一句话 ≤24 字（种族面板展示）' },
      hue: { type: 'number', desc: '外貌·色相偏移 -40..40（正暖负冷；省略全域随机）' },
      size: { type: 'number', desc: '外貌·体型倍率 0.8-1.45' },
      bulk: { type: 'number', desc: '外貌·壮硕度 0-1' },
      horns: { type: 'number', desc: '外貌·头角数 0/1/2' },
      spikes: { type: 'boolean', desc: '外貌·背棘' },
      mane: { type: 'boolean', desc: '外貌·鬃毛' },
      tail: { type: 'number', desc: '外貌·尾长 0/1/2' },
      ears: { type: 'number', desc: '外貌·耳型 0无/1竖耳/2长耳' },
      glow: { type: 'boolean', desc: '外貌·荧光器官（夜间发光）' },
      pattern: { type: 'number', desc: '外貌·花纹 0素色/1条纹/2斑纹' },
      crest: { type: 'boolean', desc: '外貌·头冠' },
    },
  },
  {
    name: 'hybridize_species',
    desc: '物种融合（超级演化）：强制两个物种杂交——杂种优势（属性均值×1.08）+ 视觉基因混合（色相中点/附器并集）；双方需各 ≥8 只存活',
    args: {
      raceA: { type: 'string', desc: '物种 A 名（如 狼）', required: true },
      raceB: { type: 'string', desc: '物种 B 名（如 蝎子）', required: true },
    },
  },
  {
    name: 'save_creation',
    desc: '造物图鉴收藏（永久保存）：把创造立即铭刻进跨世界持久的图鉴。kind=species 时给 race（世界内种族名，含刚 spawn_species 造的）即收藏其全部属性/外貌/体形/生态角色；也可从零直定义全新物种（form 体形族系 + 属性 + 外貌参数，非模板）；pin=true 同步显示在底部放置面板（永久可删）。武器/神物同理',
    args: {
      kind: { type: 'string', desc: '条目种类', required: true, enum: ['species', 'weapon', 'item'] },
      name: { type: 'string', desc: '条目名（≤8 字）', required: true },
      race: { type: 'string', desc: 'species 用：世界内种族名（收藏其属性/外貌/体形/生态角色）' },
      pin: { type: 'boolean', desc: 'true = 同步显示在放置面板（默认 true）' },
      note: { type: 'string', desc: '造物注记（图鉴展示）' },
      hp: { type: 'number', desc: 'species 直定义用：生命 1-99999' },
      dmg: { type: 'number', desc: 'species 直定义用：攻击 0-500' },
      speed: { type: 'number', desc: 'species 直定义用：速度 0.005-0.3' },
      repro: { type: 'number', desc: 'species 直定义用：繁衍率 0-0.02' },
      maxAge: { type: 'number', desc: 'species 直定义用：寿限 1-9999 年' },
      wild: { type: 'boolean', desc: 'species 直定义用：true 野生 / false 文明' },
      form: { type: 'string', desc: 'species 直定义用：体形族系（wolf/bear/deer/person…同 spawn_species；省略按角色随机）' },
      predator: { type: 'boolean', desc: 'species 直定义用：捕食者' },
      hostile: { type: 'boolean', desc: 'species 直定义用：敌视文明' },
      cap: { type: 'number', desc: 'species 直定义用：野生种群上限 4-400' },
      archetype: { type: 'string', desc: 'species 直定义用：种族原型一句话 ≤24 字' },
      hue: { type: 'number', desc: 'species 直定义用：外貌·色相 -40..40' },
      size: { type: 'number', desc: 'species 直定义用：外貌·体型 0.8-1.45' },
      horns: { type: 'number', desc: 'species 直定义用：外貌·头角 0-2' },
      glow: { type: 'boolean', desc: 'species 直定义用：外貌·荧光' },
      pattern: { type: 'number', desc: 'species 直定义用：外貌·花纹 0-2' },
      payload: { type: 'number', desc: 'weapon 用：装药 0-6' },
      delivery: { type: 'number', desc: 'weapon 用：投送 0-4' },
      guide: { type: 'number', desc: 'weapon 用：制导 0-4' },
      powerSlot: { type: 'number', desc: 'weapon 用：供能 0-4' },
      boost: { type: 'number', desc: 'weapon 用：威力倍率 0.5-3' },
      slot: { type: 'string', desc: 'item 用：槽位 wep/arm/hlm/shd/bts/rng/amu' },
      rarity: { type: 'number', desc: 'item 用：稀有度 0普通-4传说' },
      stats: { type: 'object', desc: 'item 用：属性对象 {dmg,hp,speedMul,regen,armor,crit,lifesteal,thorns,ranged}' },
      desc: { type: 'string', desc: 'item 用：描述 ≤40 字' },
    },
  },
  {
    name: 'list_creations',
    desc: '造物图鉴清单：跨世界永久保存的全部造物（物种/武器/神物），含 uid/属性/是否在放置面板/创建者',
    args: {},
  },
  {
    name: 'edit_creation',
    desc: '编辑图鉴条目（部分更新，只传要改的）：改属性/改名/改注记/改体形族系/改生态角色（predator/hostile/cap）/改放置面板可见性/重掷外貌（rerollVis）；若是物种且已在本世界降临，同步改写活体',
    args: {
      uid: { type: 'string', desc: '条目 uid 或名称（见 list_creations）', required: true },
      name: { type: 'string', desc: '新名 ≤8 字' },
      hp: { type: 'number', desc: 'species：生命 1-99999' },
      dmg: { type: 'number', desc: 'species：攻击 0-500' },
      speed: { type: 'number', desc: 'species：速度 0.005-0.3' },
      repro: { type: 'number', desc: 'species：繁衍率 0-0.02' },
      maxAge: { type: 'number', desc: 'species：寿限 1-9999' },
      wild: { type: 'boolean', desc: 'species：野生/文明形态' },
      form: { type: 'string', desc: 'species：体形族系（wolf/bear/deer/person…，换身体构造）' },
      predator: { type: 'boolean', desc: 'species：捕食者' },
      hostile: { type: 'boolean', desc: 'species：敌视文明' },
      cap: { type: 'number', desc: 'species：野生种群上限 4-400' },
      archetype: { type: 'string', desc: 'species：种族原型一句话 ≤24 字' },
      rerollVis: { type: 'boolean', desc: 'true = 重掷外貌（全新随机视觉基因组）' },
      pin: { type: 'boolean', desc: '放置面板可见性' },
      note: { type: 'string', desc: '新注记' },
      boost: { type: 'number', desc: 'weapon：威力倍率 0.5-3' },
      rarity: { type: 'number', desc: 'item：稀有度 0-4' },
      stats: { type: 'object', desc: 'item：属性对象（整体替换）' },
    },
  },
  {
    name: 'delete_creation',
    desc: '从图鉴永久删除造物（放置面板同步移除）',
    args: { uid: { type: 'string', desc: '条目 uid 或名称', required: true } },
  },
  {
    name: 'edit_race',
    desc: '种族定义原地改写（生物栏全元素可编辑）：直接改写任意种族（内置或动态）的名字/生命/攻击/速度/繁衍/寿限/野文形态/敌意——波及现存个体并随存档走；rerollVis>0 重掷外貌。改内置种族不会入库，配合 save_creation 可永久化',
    args: {
      race: { type: 'string', desc: '种族名（中文/英文/动态名均可）', required: true },
      name: { type: 'string', desc: '新名 ≤8 字' },
      hp: { type: 'number', desc: '生命上限 1-99999' },
      dmg: { type: 'number', desc: '攻击 0-500' },
      speed: { type: 'number', desc: '速度 0.005-0.3' },
      repro: { type: 'number', desc: '繁衍率 0-0.02' },
      maxAge: { type: 'number', desc: '寿限 1-9999 年' },
      wild: { type: 'boolean', desc: 'true 野生 / false 文明（可建国）' },
      hostile: { type: 'boolean', desc: '是否敌视文明' },
      rerollVis: { type: 'number', desc: '重掷外貌强度 0.2-3（省略不变）' },
    },
  },
  {
    name: 'set_unit_attr',
    desc: '单位属性白名单改写：名字≤12字/hp 1..maxHp×5/maxHp 1..99999/dmg 0..500/speed 0.1..8/kills 0..9999/age 0..寿限/civ（数字 id 或国名，-1=逐出为野生）/x,y 坐标/job 0..6（平民/农民/战士/弓手/建筑师/商人/贵族）；返回 before→after 字典',
    args: {
      id: { type: 'number', desc: '单位 id', required: true },
      name: { type: 'string', desc: '新名字（≤12 字）' },
      hp: { type: 'number', desc: '当前生命（clamp 1..maxHp×5，允许超额治疗）' },
      maxHp: { type: 'number', desc: '生命上限 1..99999（改后同步 clamp hp）' },
      dmg: { type: 'number', desc: '攻击力 0..500' },
      speed: { type: 'number', desc: '速度 0.1..8' },
      kills: { type: 'number', desc: '击杀数 0..9999' },
      age: { type: 'number', desc: '年龄 0..寿限' },
      civ: { type: 'object', desc: '归属：数字国家 id 或国家名；-1 = 逐出为野生' },
      x: { type: 'number', desc: '新 x 坐标（0-255）' },
      y: { type: 'number', desc: '新 y 坐标（0-159）' },
      job: { type: 'number', desc: '职业 0..6' },
    },
  },
  {
    name: 'teleport_unit',
    desc: '单位瞬移：直接落点（清移动目标与乘船状态）',
    args: {
      id: { type: 'number', desc: '单位 id', required: true },
      x: { type: 'number', desc: '目标 x（0-255）', required: true },
      y: { type: 'number', desc: '目标 y（0-159）', required: true },
    },
  },
  {
    name: 'kill_units',
    desc: '目标处决：ids 直杀或按 race/kingdom/坐标圆域过滤（cap=limit 默认 50 上限 200；引擎自然收尸）',
    args: {
      ids: { type: 'object', desc: '单位 id 数组（给出则忽略其余过滤条件）' },
      race: { type: 'string', desc: '种族过滤' },
      kingdom: { type: 'string', desc: '国家名过滤' },
      x: { type: 'number', desc: '处决圆域中心 x' },
      y: { type: 'number', desc: '处决圆域中心 y' },
      radius: { type: 'number', desc: '处决圆域半径 1-40' },
      limit: { type: 'number', desc: '上限，默认 50，最大 200' },
    },
  },
  {
    name: 'heal_area',
    desc: '治疗神力：区域内单位回复生命（radius 1-20）',
    args: {
      x: { type: 'number', desc: '中心 x', required: true },
      y: { type: 'number', desc: '中心 y', required: true },
      radius: { type: 'number', desc: '半径 1-20', required: true },
    },
  },
  {
    name: 'gene_control',
    desc: '基因操控三式：jump 基因跳变（amount 0.1-3 默认 1，四维乘数重铸）/ reroll_trait 重掷特质 / mutate_area 区域变异（radius 1-12）',
    args: {
      action: { type: 'string', desc: '基因动作', required: true, enum: ['jump', 'reroll_trait', 'mutate_area'] },
      id: { type: 'number', desc: '单位 id（jump/reroll_trait 必填）' },
      amount: { type: 'number', desc: '跳变强度 0.1-3，默认 1' },
      x: { type: 'number', desc: 'mutate_area 中心 x' },
      y: { type: 'number', desc: 'mutate_area 中心 y' },
      radius: { type: 'number', desc: 'mutate_area 半径 1-12' },
    },
  },
  {
    name: 'spawn_item',
    desc: '神赐宝物：在指定点掉落随机装备（tier chest=宝箱/chest2=秘银宝箱/chest3=神话宝箱，默认 chest）',
    args: {
      tier: { type: 'string', desc: '宝箱档位', enum: ['chest', 'chest2', 'chest3'] },
      x: { type: 'number', desc: '掉落点 x（省略则随机）' },
      y: { type: 'number', desc: '掉落点 y（省略则随机）' },
    },
  },
  {
    name: 'cast_fx',
    desc: '纯视觉特效（不产生实际伤害）：explosion 爆炸/bolt 闪电束/skull 骷髅/heart 爱心/smoke 烟尘/hit 打击',
    args: {
      kind: { type: 'string', desc: '特效种类', required: true, enum: ['explosion', 'bolt', 'skull', 'heart', 'smoke', 'hit'] },
      x: { type: 'number', desc: '位置 x', required: true },
      y: { type: 'number', desc: '位置 y', required: true },
      ttl: { type: 'number', desc: '持续 tick 30-600，默认 90' },
    },
  },

  // ————————————————— L2 文明王国（列国/家族/兴衰/成就/旨意） —————————————————
  {
    name: 'get_kingdoms',
    desc: '列国列表概览（人口/领土/军队/科技/稳定度等关键指标）',
    args: {},
  },
  {
    name: 'get_kingdom',
    desc: '单国深度详情：领土、军团、外交、科技、经济、防御',
    args: { name: { type: 'string', desc: '国家名（见 get_kingdoms 返回）', required: true } },
  },
  {
    name: 'get_societal',
    desc: '社会涌现三螺旋实况：恐慌传染场、血仇网络、家族谱系',
    args: {},
  },
  {
    name: 'get_families',
    desc: '望族榜：按现存族人规模降序（limit 默认 10 上限 24）：姓氏/种族/先祖/立族年/人口/累计击杀/在世最高代数',
    args: { limit: { type: 'number', desc: '条数，默认 10，最大 24' } },
  },
  {
    name: 'get_history',
    desc: '全局兴衰曲线：年份/总人口/列国数 采样点（每 5 年一次，超 60 点均匀抽稀）+ 每个现存王国近 10 点人口/领土/房屋明细',
    args: {},
  },
  {
    name: 'get_achievements',
    desc: '成就快照：已解锁 [id, 名, 年份] 列表 + 成就总数 + 未解锁进度缓存（跨世界元进度）',
    args: {},
  },
  {
    name: 'get_weapon',
    desc: '指定王国的涌现武器清单：名/代数/伤害/半径/伤害类型/投送方式/战绩（按伤害降序）',
    args: { kingdom: { type: 'string', desc: '国家名', required: true } },
  },
  {
    name: 'forge_divine_weapon',
    desc: '神铸武器（神谕亲铸）：为王国绕过时代/经费/上限铸造奇迹武器——四槽组件可钦定（装药 payload 0-6/投送 delivery 0-4/制导 guide 0-4/供能 power 0-4，省略则按该国军备时代自动选优）；boost 0.5-3 威力倍率',
    args: {
      kingdom: { type: 'string', desc: '受铸王国名', required: true },
      name: { type: 'string', desc: '武器名（≤30 字，省略则「神铸·…·天启」）' },
      payload: { type: 'number', desc: '装药组件 0 穿甲/1 高爆/2 铝热/3 电脉/4 毒剂/5 聚变/6 反物' },
      delivery: { type: 'number', desc: '投送组件 0 火炮/1 火箭/2 钻地/3 滑翔/4 轨道' },
      guide: { type: 'number', desc: '制导组件 0 哑弹/1 惯导/2 精导/3 蜂群/4 量子' },
      power: { type: 'number', desc: '供能组件 0 化学/1 激光/2 超导/3 堆心/4 奇点' },
      boost: { type: 'number', desc: '威力倍率 0.5-3，默认 1.6' },
    },
  },
  {
    name: 'merge_kingdoms',
    desc: '王国融合（神谕钦定）：两个王国和平合并为联合王朝——领土/建筑/军团/国库/科技并集全量继承（不流血的统一）；国力强者存续',
    args: {
      kingdomA: { type: 'string', desc: '王国 A 名', required: true },
      kingdomB: { type: 'string', desc: '王国 B 名', required: true },
    },
  },
  {
    name: 'civ_control',
    desc: '王国操控八式：create 建国（race+x/y，缺省落点=随机陆地；自带 6 名开国民众）/ rename 改国名（≤16字）/ newKing 换君主（newKing ≤12字）/ destroy 灭国 / setgov 政体革命（0 部落/1 君主/2 神权/3 共和/4 帝国）/ gold 赐财 / knowledge 赐知识（amount 累加，clamp 0..999999）/ complete_tech 秒研科技',
    args: {
      action: { type: 'string', desc: '操控动作', required: true, enum: ['create', 'rename', 'newKing', 'destroy', 'setgov', 'gold', 'knowledge', 'complete_tech'] },
      name: { type: 'string', desc: '目标国家名（create 时省略；名全等或包含匹配）' },
      race: { type: 'string', desc: 'create 用：种族名（如 人类/精灵/orc，缺省人类）' },
      x: { type: 'number', desc: 'create 用：落点 x' },
      y: { type: 'number', desc: 'create 用：落点 y' },
      newName: { type: 'string', desc: 'rename 用：新国名 ≤16 字' },
      newKing: { type: 'string', desc: 'newKing 用：新君主名 ≤12 字' },
      gov: { type: 'number', desc: 'setgov 用：政体 0-4' },
      amount: { type: 'number', desc: 'gold/knowledge 用：增减量（可负）' },
      tech: { type: 'string', desc: 'complete_tech 用：科技 key（须该国可研究）' },
    },
  },
  {
    name: 'issue_directive',
    desc: '颁布王国战略旨意（该国自行达成，可能失败；同时至多 2 条）：annihilate 灭国令/conquer 攻城令/expand 扩张令/wealth 富国令/wisdom 启智令/populate 人口令/legion 军团令/build 建城令/unify 统一令/mobilize 总动员/alliance 结盟令/temple 立信令；param 为目标数值（默认 0=用引擎默认），target 为敌国名（annihilate/conquer/alliance 用）',
    args: {
      kingdom: { type: 'string', desc: '颁布国名', required: true },
      kind: {
        type: 'string',
        desc: '旨意种类',
        required: true,
        enum: ['annihilate', 'conquer', 'expand', 'wealth', 'wisdom', 'populate', 'legion', 'build', 'unify', 'mobilize', 'alliance', 'temple'],
      },
      param: { type: 'number', desc: '目标数值（expand 格数/wealth 财富/populate 人口等），默认 0' },
      target: { type: 'string', desc: '目标敌国名（annihilate/conquer/alliance）' },
    },
  },

  // ————————————————— L3 战争外交（战争/世界大战/联盟/种族关系） —————————————————
  {
    name: 'get_wars',
    desc: '进行中的战争与外交关系全景（含联盟概览）',
    args: {},
  },
  {
    name: 'get_world_war',
    desc: '世界大战实况：阶段/参战国名单（含现存）/阵亡/停战/核弹与未来武器发射计数/胜者',
    args: {},
  },
  {
    name: 'get_alliances',
    desc: '联盟全量清单：名称/盟主/成员国列国名/凝聚力/成立年（<25 濒临瓦解）',
    args: {},
  },
  {
    name: 'diplomacy_control',
    desc: '外交六式（a/b 为国家名，shift_relations 时为种族名）：declare_war 宣战（reason：border边境/conquest征服/plunder劫掠/revenge复仇/annex灭国/unify统一/holy圣战/alliance盟约，默认 conquest）/ make_peace 停战 / shift_relations 种族关系（delta clamp -100..100）/ form_alliance 缔盟 / join_alliance 入盟（b 为盟主国）/ leave_alliance 退盟',
    args: {
      action: { type: 'string', desc: '外交动作', required: true, enum: ['declare_war', 'make_peace', 'shift_relations', 'form_alliance', 'join_alliance', 'leave_alliance'] },
      a: { type: 'string', desc: '主体：国家名（shift_relations 为种族名）', required: true },
      b: { type: 'string', desc: '客体：国家名/种族名/盟主国名' },
      reason: { type: 'string', desc: 'declare_war 用：开战理由', enum: ['border', 'conquest', 'plunder', 'revenge', 'annex', 'unify', 'holy', 'alliance'] },
      delta: { type: 'number', desc: 'shift_relations 用：关系增减 -100..100' },
      text: { type: 'string', desc: 'make_peace 用：停战诏书文本（默认「神谕敕令：止戈」）' },
    },
  },
  {
    name: 'world_war_control',
    desc: '世界大战操控：ignite 引燃终极大战（不死不休）/ truce 全球停战 years 年（1-100 默认 12，到期自动重燃）/ resume 撕毁停战立即重启 / end 神谕终战（无胜者）',
    args: {
      action: { type: 'string', desc: '大战动作', required: true, enum: ['ignite', 'truce', 'resume', 'end'] },
      years: { type: 'number', desc: 'truce 用：停战年数 1-100，默认 12' },
    },
  },

  // ————————————————— L4 神力天灾（25+ 神力/清场/宣告） —————————————————
  {
    name: 'divine_power',
    desc: '全能神力（缺省坐标=随机落点；power 1-3 默认 2 控制强度；radius 2-16 默认 6 控制范围）：攻击系 meteor 陨石/meteor_shower 陨石雨/quake 地震/volcano 火山/lightning 天罚闪电/tornado 龙卷风/tsunami 海啸/blackhole 黑洞/wrath 神怒风暴/acid_rain 酸雨；气候系 drought 干旱/flood 洪水/blizzard 暴风雪/sandstorm 沙暴/typhoon 台风/locust 蝗灾/famine 饥荒云/ice_age 冰川纪/rain_cloud 雨云；祝福系 bless 神恩/curse 诅咒/love 爱之甘霖/heal 治疗/mutate 变异/teleport 传送',
    args: {
      kind: {
        type: 'string',
        desc: '神力种类',
        required: true,
        enum: [
          'meteor', 'meteor_shower', 'quake', 'volcano', 'lightning', 'tornado', 'tsunami', 'drought', 'flood',
          'blizzard', 'sandstorm', 'typhoon', 'acid_rain', 'locust', 'famine', 'ice_age', 'sinkhole', 'blackhole',
          'wrath', 'curse', 'bless', 'love', 'heal', 'mutate', 'teleport', 'rain_cloud',
        ],
      },
      x: { type: 'number', desc: '落点 x（省略则随机）' },
      y: { type: 'number', desc: '落点 y（省略则随机）' },
      power: { type: 'number', desc: '威力 1-3，默认 2' },
      radius: { type: 'number', desc: '半径 2-16，默认 6（范围型神力用）' },
    },
  },
  {
    name: 'clear_area',
    desc: '清场：what units 处决区域内生物(≤200)/buildings 拆除建筑/fires 扑灭火情/all 全部（默认 all；radius 1-20）',
    args: {
      x: { type: 'number', desc: '中心 x', required: true },
      y: { type: 'number', desc: '中心 y', required: true },
      radius: { type: 'number', desc: '半径 1-20', required: true },
      what: { type: 'string', desc: '清理对象', enum: ['units', 'buildings', 'fires', 'all'] },
    },
  },
  {
    name: 'announce',
    desc: '神谕宣告：向世界播报一段话（纪事留档 + 界面提示；text ≤120 字）',
    args: {
      text: { type: 'string', desc: '宣告文本 ≤120 字', required: true },
      tone: { type: 'string', desc: '语气', enum: ['info', 'good', 'danger'] },
    },
  },

  // ————————————————— L5 机制热插拔（法则/参数/触发器/机制修改） —————————————————
  {
    name: 'get_laws',
    desc: '世界法则开关清单（全部可开关规则的 key 与当前状态）',
    args: {},
  },
  {
    name: 'set_law',
    desc: '开关世界法则（key 见 get_laws 返回）',
    args: {
      key: { type: 'string', desc: '法则 key（见 get_laws）', required: true },
      on: { type: 'boolean', desc: 'true 开启 / false 关闭', required: true },
    },
  },
  {
    name: 'get_params',
    desc: '可热调参数清单：分组、范围、当前值（filter 按组名或关键词过滤）',
    args: { filter: { type: 'string', desc: '按组名或关键词过滤，如 "生态"、"战斗"' } },
  },
  {
    name: 'get_param',
    desc: '单个参数详情：当前值、范围、说明',
    args: { path: { type: 'string', desc: '参数路径（见 get_params）', required: true } },
  },
  {
    name: 'set_param',
    desc: '热加载修改模拟参数（自动校验范围并 clamp）',
    args: {
      path: { type: 'string', desc: '参数路径（先 get_params 确认范围）', required: true },
      value: { type: 'number', desc: '新数值', required: true },
    },
  },
  {
    name: 'create_law',
    desc: '创建热载机制（Agent 法则 v2，随存档走）。可选 trigger 对象（省略=用顶层 everyYears/chance 周期参数）：{kind:\'cron\'|\'event\'|\'condition\', everyYears, chance, season, event, cond}——kind=cron 周期触发；kind=event 事件触发（event 填世界事件类型，如 \'fall\'王国灭亡/\'war\'宣战/\'meteor\'陨石/\'worldwar\'大战，每次该类事件发生时按 chance 判定，动作缺省坐标落事件发生地）；kind=condition 条件触发（cond 填条件表达式 {op:\'gt\',stat:\'pop\',value:600}，op ∈ gt|lt|gte|lte|eq|and|or|not 可嵌套 {op:\'and\',sub:[...]}，stat 用 get_stats 的键如 pop/kingdoms/wars/panicking/fires/counter:名）。actions 为动作对象数组 {kind,...参数}，kind 39 种：meteor|meteor_shower|quake|volcano|lightning|tornado|tsunami|drought|flood|blizzard|typhoon|acid_rain|locust|famine|ice_age|sinkhole|blackhole|wrath|curse|bless|love|heal|mutate|teleport|rain_cloud（25 种神力，可带 x/y/power/radius/count）|nuke 核弹|plague 瘟疫|fire 天火|boom 爆破|river 开河|oasis 绿洲（v5 六神力，可带 x/y/power/radius）|weather（weather:\'rain\'降雨/\'sandstorm\'沙暴 + x/y/radius）|spawn（race/count/x/y）|terrain（terrain/radius/x/y，含 ice 冰面）|smite（x/y/radius 神罚诛灭）|param（path/value 热改参数）|announce（text 宣告）|mech（action:\'enable\'|\'disable\'，target:\'L1\' 启停其他机制）|counter（name/op:\'add\'|\'set\'/value 计数器，供 counter:名 条件读取）',
    args: {
      name: { type: 'string', desc: '法则名（简短有力，如「赤月审判」）', required: true },
      desc: { type: 'string', desc: '法则描述（造物主可读的意图说明）', required: true },
      everyYears: { type: 'number', desc: 'cron 触发间隔年数 1-100（trigger.kind=cron 时同名字段优先）', required: true },
      chance: { type: 'number', desc: '每次触发概率 0-1', required: true },
      season: { type: 'number', desc: '限定季节：0 春 / 1 夏 / 2 秋 / 3 冬（省略=不限）' },
      trigger: {
        type: 'object',
        desc: 'v2 触发器（可选）：{kind, everyYears, chance, season, event, cond}——见工具描述；给出时覆盖顶层周期参数',
      },
      actions: {
        type: 'object',
        desc: '动作数组，每个元素 {kind, ...参数}，kind 见工具描述（33 种）',
        required: true,
      },
      durationYears: { type: 'number', desc: '法则存续年数（省略=永久）' },
    },
  },
  {
    name: 'manage_agent_laws',
    desc: '管理已创建的机制（列出/开关/移除）；修改机制内容用 update_law',
    args: {
      action: { type: 'string', desc: '管理动作', required: true, enum: ['list', 'toggle', 'remove'] },
      id: { type: 'string', desc: '法则 id（toggle/remove 必填，见 list 返回）' },
      enabled: { type: 'boolean', desc: 'toggle 时目标状态' },
    },
  },
  {
    name: 'update_law',
    desc: '修改既有机制（部分更新，只传要改的字段）：name/desc/enabled/everyYears/chance/season/durationYears/event/cond/actions——可改触发器与动作，把机制调成想要的样子',
    args: {
      id: { type: 'string', desc: '法则 id（见 manage_agent_laws 的 list）', required: true },
      name: { type: 'string', desc: '新法则名' },
      desc: { type: 'string', desc: '新描述' },
      enabled: { type: 'boolean', desc: '启用状态' },
      everyYears: { type: 'number', desc: 'cron 间隔年数 1-100' },
      chance: { type: 'number', desc: '触发概率 0-1' },
      season: { type: 'number', desc: '限定季节 0-3' },
      durationYears: { type: 'number', desc: '存续年数' },
      event: { type: 'string', desc: 'event 触发器的 WorldEventKind' },
      cond: { type: 'object', desc: 'condition 触发器的条件表达式（可嵌套 and/or/not）' },
      actions: { type: 'object', desc: '新动作数组（整体替换）' },
    },
  },
  {
    name: 'get_triggers',
    desc: '事件触发器清单（玩家布置的像素级条件触发器：条件/动作/位置/冷却/已触发次数）',
    args: {},
  },

  // ————————————————— L6 元控制（能力自省/存档/时间/镜头） —————————————————
  {
    name: 'get_introspection',
    desc: '能力自省：全部工具名清单 + L0-L6 七层能力地图（层层向上覆盖全游戏的自描述索引——不知道用什么工具时先看这个）',
    args: {},
  },
  {
    name: 'get_saves',
    desc: '存档槽列表：各槽 key/保存时间/来源/年份/人口/列国数（含自动存档槽）',
    args: {},
  },
  {
    name: 'save_world',
    desc: '保存世界到存档槽（slot0/slot1/slot2，默认 slot0；整世界序列化到浏览器存储）',
    args: { slot: { type: 'string', desc: '槽位', enum: ['slot0', 'slot1', 'slot2'] } },
  },
  {
    name: 'time_control',
    desc: '时间控制：pause 暂停 / resume 恢复 / toggle 切换 / set_speed 调速（speed 0-16，0=暂停；返回当前速度与暂停态）',
    args: {
      action: { type: 'string', desc: '时间动作', required: true, enum: ['pause', 'resume', 'toggle', 'set_speed'] },
      speed: { type: 'number', desc: 'set_speed 用：速度 0-16（1=常速 8=极速）' },
    },
  },
  {
    name: 'camera_control',
    desc: '镜头控制：jump 跳转坐标 / follow_unit 跟随单位 / follow_civ 跳转并选中王国 / unfollow 取消跟随',
    args: {
      action: { type: 'string', desc: '镜头动作', required: true, enum: ['jump', 'follow_unit', 'follow_civ', 'unfollow'] },
      x: { type: 'number', desc: 'jump 用：目标 x' },
      y: { type: 'number', desc: 'jump 用：目标 y' },
      id: { type: 'number', desc: 'follow_unit 用：单位 id' },
      kingdom: { type: 'string', desc: 'follow_civ 用：国家名' },
    },
  },
];

/** 七层能力地图（与 AGENT_TOOLS 的分组注释一一对应；get_introspection 渲染用） */
export const TOOL_LAYERS: { layer: string; tools: string[] }[] = [
  {
    layer: 'L0 世界内核',
    tools: [
      'get_world_digest', 'get_tile', 'get_region', 'get_nature', 'get_stats',
      'get_chronicle', 'get_events', 'terrain_paint', 'era_control',
    ],
  },
  {
    layer: 'L1 生命单位',
    tools: [
      'get_units', 'get_unit', 'get_unit_brain', 'get_neuro', 'get_ecology', 'get_races', 'get_evo',
      'find_units', 'search_units', 'spawn_creatures', 'spawn_species', 'hybridize_species', 'set_unit_attr', 'teleport_unit', 'kill_units',
      'heal_area', 'gene_control', 'spawn_item', 'cast_fx',
      'save_creation', 'list_creations', 'edit_creation', 'delete_creation', 'edit_race',
    ],
  },
  {
    layer: 'L2 文明王国',
    tools: [
      'get_kingdoms', 'get_kingdom', 'get_societal', 'get_families', 'get_history',
      'get_achievements', 'get_weapon', 'forge_divine_weapon', 'merge_kingdoms', 'civ_control', 'issue_directive',
    ],
  },
  {
    layer: 'L3 战争外交',
    tools: ['get_wars', 'get_world_war', 'get_alliances', 'diplomacy_control', 'world_war_control'],
  },
  { layer: 'L4 神力天灾', tools: ['divine_power', 'clear_area', 'announce'] },
  {
    layer: 'L5 机制热插拔',
    tools: [
      'get_laws', 'set_law', 'get_params', 'get_param', 'set_param',
      'create_law', 'manage_agent_laws', 'update_law', 'get_triggers',
    ],
  },
  {
    layer: 'L6 元控制',
    tools: ['get_introspection', 'get_saves', 'save_world', 'time_control', 'camera_control'],
  },
];

/** 参数的紧凑签名：name:type（enum 时 type 直接列出可选值） */
function renderArg(name: string, a: ToolArgDef): string {
  const t = a.enum ? a.enum.join('|') : a.type;
  return `${name}${a.required ? '' : '?'}:${t}`;
}

/** 把目录渲染成紧凑中文文本，供 system prompt 注入 */
export function renderToolCatalog(): string {
  return AGENT_TOOLS.map((t) => {
    const args = Object.entries(t.args).map(([n, a]) => renderArg(n, a));
    return `- ${t.name}(${args.join(', ')}): ${t.desc}`;
  }).join('\n');
}
