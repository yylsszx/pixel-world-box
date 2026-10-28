// ============ 神谕语义路由（v8 · openclaw 式精简工具集） ============
// 问题：88 个工具全量 schema 下发会稀释模型注意力（工具选择困难/参数错乱——
//  模型对每个工具只有浅层认知），且 schema token 巨大（~15k）挤压有效上下文，
//  复杂多轮任务后半段质量明显下降。openclaw 级 harness 的精髓是「少而精的工具集」。
// 方案：按「造物主最新指令」语义筛选最相关的工具子集（约 20 个）只发给原生 FC schema——
//  ① 常驻核心（数据源/万能后手/自省）恒在；
//  ② 意图别名表：高频自然语言模式 → 工具（人工维护的高精度路由）；
//  ③ 元数据自动匹配：工具 desc/enum/参数名的 n-gram 与指令求交（倒排 + 文档频率降权）。
// 安全性：执行门保持全量——模型仍可用文本协议调用系统提示词全量目录中的任何工具
//  （解析器 v3 支持）；筛选只影响原生 schema 的可见集，绝不产生「未知工具」。
// 置信度兜底：信号不足（命中工具 < 8 个）→ 回退全量，宁多勿漏。

import type { ToolDef } from './tools';

/** 常驻核心：数据源 + 万能后手 + 自省（几乎任何任务都可能用到；openclaw 的 bash/read/write 同等地位） */
const ALWAYS = new Set([
  'get_stats',
  'get_world_digest',
  'get_introspection',
  'get_chronicle',
  'run_script',
  'read_state',
  'write_state',
  'get_params',
]);

/** 意图别名表：玩家自然语言高频模式 → 工具（人工维护；正则按序全量评估，命中即 +5 分） */
const INTENT_ALIASES: ReadonlyArray<{ re: RegExp; tools: readonly string[] }> = [
  // —— 神力天灾 ——
  { re: /核弹|核武|原子弹|nuclear|nuke|蘑菇云/, tools: ['divine_power', 'get_tile'] },
  { re: /陨石|流星|meteor/, tools: ['divine_power', 'get_tile'] },
  { re: /瘟疫|疫病|plague|病毒传播/, tools: ['divine_power', 'get_ecology'] },
  { re: /地震|火山喷|火山爆|闪电|雷击|落雷|龙卷|海啸|洪水|暴雪|沙暴|沙尘暴|台风|酸雨|蝗灾|饥荒|冰期|冰川期|天坑|黑洞|诅咒|祝福|干旱|酸雨/, tools: ['divine_power', 'get_tile'] },
  { re: /神力|天灾|天罚|降下|施放|轰击|毁灭/, tools: ['divine_power'] },
  { re: /爆炸|爆破|炸掉|boom/, tools: ['divine_power'] },
  { re: /开河|挖河|运河|绿洲/, tools: ['divine_power', 'terrain_paint'] },
  // —— 物种/生物 ——
  { re: /新物种|全新.{0,4}(物种|生物|种族)|创造.{0,4}(物种|生物)|造.{0,3}(物种|生物)|设计.{0,4}(物种|生物)/, tools: ['spawn_species', 'save_creation'] },
  { re: /融合|杂交|杂种|混血|嫁接/, tools: ['hybridize_species', 'get_races'] },
  { re: /生成|召唤|放置|降临|放养|投放|放.{0,2}(只|头|条|群|个)/, tools: ['spawn_creatures'] },
  { re: /变成|转化|变为|感染|全体.{0,3}(变|改)|所有.{0,4}(变|改|杀|消灭)/, tools: ['spawn_creatures', 'hybridize_species', 'gene_control', 'get_races', 'run_script'] },
  { re: /僵尸|强盗|盗贼|怪物|魔物/, tools: ['spawn_creatures', 'get_ecology', 'get_units'] },
  { re: /(绵)?羊|狼|熊|鹿|企鹅|骆驼|蝎子|巨龙|飞龙/, tools: ['spawn_creatures', 'get_ecology', 'get_units', 'get_races'] },
  { re: /物种|生物|种群|生态/, tools: ['get_ecology', 'get_races', 'get_evo'] },
  { re: /演化|进化|种化|图谱/, tools: ['get_evo', 'get_races'] },
  { re: /图鉴|藏品|永久/, tools: ['list_creations', 'save_creation', 'edit_creation'] },
  // —— 单位/属性 ——
  { re: /强化|变强|削弱|变弱|三倍|加倍|翻倍|倍率|属性|生命值|攻击力|速度/, tools: ['set_unit_attr', 'get_unit', 'find_units', 'search_units'] },
  { re: /英雄|勇士|战士|国王|女王|首领|传奇|最强|冠军|名人/, tools: ['find_units', 'get_unit', 'get_unit_brain', 'search_units'] },
  { re: /传送|瞬移/, tools: ['teleport_unit', 'divine_power'] },
  { re: /处决|抹除|清除|消灭|杀掉|杀死|屠杀/, tools: ['kill_units', 'clear_area'] },
  { re: /治疗|治愈|复活|康复/, tools: ['heal_area', 'divine_power'] },
  // —— 文明/战争 ——
  { re: /王国|国家|列国|帝国|建国|建立.{0,3}国/, tools: ['get_kingdoms', 'civ_control'] },
  { re: /宣战|开战|战争|打仗|进攻|征服/, tools: ['diplomacy_control', 'get_wars', 'issue_directive'] },
  { re: /结盟|联盟|议和|停战|和平|外交|关系/, tools: ['diplomacy_control', 'get_wars'] },
  { re: /合并|统一|吞并/, tools: ['merge_kingdoms', 'get_kingdoms'] },
  { re: /军团|军队|部队|出征/, tools: ['issue_directive', 'get_kingdoms'] },
  { re: /武器|神剑|神器|锻造|铸造/, tools: ['forge_divine_weapon', 'get_evo'] },
  { re: /科技|研究|知识/, tools: ['civ_control', 'get_kingdoms'] },
  { re: /政体|国库|财政|经济/, tools: ['civ_control', 'get_kingdoms'] },
  { re: /世界大战|全面战争|大战/, tools: ['world_war_control', 'get_wars'] },
  // —— 地形/自然 ——
  { re: /地形|山地|山脉|造山|平原|盆地|建一座|建造|筑成/, tools: ['terrain_paint', 'get_region'] },
  { re: /雪山|冰山|冻土|极地/, tools: ['terrain_paint', 'get_nature'] },
  { re: /北方|南方|东方|西方|中央|角落|边陲/, tools: ['camera_control', 'get_region'] },
  { re: /水|海洋|湖泊|河流|陆地|抬升/, tools: ['terrain_paint'] },
  { re: /季节|气候|天气|温度|全球/, tools: ['get_nature', 'era_control', 'get_stats'] },
  { re: /侵蚀|洋流|海平面|深时|板块/, tools: ['get_nature'] },
  // —— 机制/规则/扩展 ——
  { re: /规则|法则|机制|定律/, tools: ['get_laws', 'create_law', 'update_law'] },
  { re: /触发|周期|每当|一旦/, tools: ['create_law', 'manage_agent_laws'] },
  { re: /参数|调速|物理|引擎配置/, tools: ['get_params', 'set_params', 'set_param'] },
  { re: /插件|工具箱|能力包/, tools: ['list_plugins', 'register_plugin', 'toggle_plugin'] },
  { re: /权柄包|系统包|拆装|拆除|装回|九层|一切皆插件/, tools: ['list_power_packs', 'toggle_power_pack'] },
  { re: /mod|模组|模改/, tools: ['list_mods', 'install_mod', 'toggle_mod'] },
  { re: /存档|读档|回滚|时间线/, tools: ['save_world', 'load_world'] },
  { re: /时间|暂停|加速|快进|流速/, tools: ['time_control'] },
  { re: /镜头|视角|跟随|看/, tools: ['camera_control'] },
  // —— 叙事/查询 ——
  { re: /纪事|历史|大事记|编年|发生了什么|最近|大事|新鲜事|讲(一?段|个)/, tools: ['get_chronicle', 'get_events', 'get_world_digest'] },
  { re: /统计|数量|多少|人口|排行|排名|对比|分布/, tools: ['get_stats', 'get_ecology', 'get_races', 'get_kingdoms'] },
  { re: /局势|现状|战况|分析|研判/, tools: ['get_world_digest', 'get_stats', 'get_kingdoms'] },
  { re: /预言|未来|推演/, tools: ['get_world_digest', 'get_stats', 'get_chronicle'] },
  { re: /神经|决策|战或逃|PPO/, tools: ['get_neuro', 'get_unit_brain'] },
  { re: /社会|恐慌|血仇|家族/, tools: ['get_stats', 'find_units'] },
];

/** 中文 2-gram 切分（含单字段兜底）；英文单词整体 */
function tokenize(text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  for (const w of lower.match(/[a-z][a-z0-9_]+/g) ?? []) out.push(w);
  for (const seg of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (seg.length === 1) {
      out.push(seg);
      continue;
    }
    for (let i = 0; i < seg.length - 1; i++) out.push(seg.slice(i, i + 2));
  }
  return out;
}

/** 工具的可搜索语料：名字 + 描述 + 参数名/描述 + enum 值 */
function toolCorpus(t: ToolDef): string {
  const parts: string[] = [t.name.replace(/_/g, ' '), t.desc];
  for (const [k, ad] of Object.entries(t.args)) {
    parts.push(k.replace(/_/g, ' '), ad.desc);
    if (ad.enum) parts.push(ad.enum.join(' '));
  }
  return parts.join(' \n ');
}

/**
 * 语义筛选：指令文本 → 相关工具子集。
 * 返回筛选结果 + 是否回退全量（低置信度时 fallback=true，调用方直接用全量）。
 */
export function selectRelevantTools(
  text: string,
  tools: ToolDef[],
  maxTools = 22,
): { selected: ToolDef[]; fallback: boolean } {
  if (!text.trim()) return { selected: tools, fallback: true };
  const byName = new Map(tools.map((t) => [t.name, t]));
  const scores = new Map<string, number>();
  const bump = (name: string, v: number) => scores.set(name, (scores.get(name) ?? 0) + v);

  // ① 意图别名表（高精度人工路由）
  for (const { re, tools: names } of INTENT_ALIASES) {
    if (re.test(text)) for (const n of names) bump(n, 5);
  }

  // ② 元数据自动匹配：倒排（gram → 工具集）+ 文档频率降权（泛词如「世界/单位/返回」分值趋零）
  const userTokens = new Set(tokenize(text));
  if (userTokens.size > 0) {
    const inv = new Map<string, Set<string>>();
    for (const t of tools) {
      for (const g of new Set(tokenize(toolCorpus(t)))) {
        let s = inv.get(g);
        if (!s) {
          s = new Set();
          inv.set(g, s);
        }
        s.add(t.name);
      }
    }
    for (const [gram, names] of inv) {
      if (!userTokens.has(gram)) continue;
      const df = names.size;
      if (df > 8) continue; // 泛词（出现在太多工具里）无区分度，跳过
      const w = 2 / (1 + Math.log2(df)); // df=1 → 2 分；df=8 → ~0.6 分
      for (const n of names) bump(n, w);
    }
    // ③ 工具名直接命中（玩家懂英文工具名时权重最高）
    for (const t of tools) {
      const nameWords = t.name.split('_');
      const hit = nameWords.some((w) => w.length > 2 && userTokens.has(w)) || userTokens.has(t.name);
      if (hit) bump(t.name, 4);
    }
  }

  // ④ 取 top-K 并入常驻核心
  const ranked = [...scores.entries()]
    .filter(([n]) => byName.has(n))
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTools)
    .map(([n]) => n);
  const finalNames = new Set<string>([...ranked, ...ALWAYS]);
  const selected = tools.filter((t) => finalNames.has(t.name));

  // 置信度兜底：有效命中太少 → 回退全量（宁多勿漏）
  if (ranked.length < 6) return { selected: tools, fallback: true };
  return { selected, fallback: false };
}
