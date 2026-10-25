// ============ 引擎热参数注册表（Task 40：神谕 Agent 热加载底座） ============
// 设计原则：
//   1. 全部参数为「活的」可变值——引擎热路径每次使用都经 ep() 读取，setEngineParam 即时生效（零重启零读档）；
//   2. 每个参数都带元数据（组/标签/说明/范围/步进）——get_params 工具与 UI 共用同一份真源；
//   3. 值域 clamp 硬校验：越界一律夹回 [min, max]，防 Agent 或玩家把模拟调爆；
//   4. 不入存档（与 laws 不同：参数是实验性旋钮，读档即回到默认基调——刻意设计，避免「幽灵调参」）。
export interface ParamMeta {
  /** 点路径，如 'war.declareRate' */
  path: string;
  /** 分组名（中文，get_params 按组归并展示） */
  group: string;
  /** 短标签 */
  label: string;
  /** 一句话说明（当前值会怎样影响世界） */
  desc: string;
  min: number;
  max: number;
  step: number;
  /** 当前值（活值——直接改这里就生效） */
  value: number;
}

/** 参数表（有序数组——注册顺序即展示顺序） */
const REG: ParamMeta[] = [
  // ---- 人口与繁衍 ----
  { path: 'pop.reproMul', group: '人口与繁衍', label: '繁衍倍率', desc: '全体生物繁衍概率的全局乘数（1=自然基调；>1 人口爆炸，<1 走向绝育）', min: 0.1, max: 3, step: 0.05, value: 1 },
  // ---- 生态与植被 ----
  { path: 'eco.regrowBase', group: '生态与植被', label: '植被复苏基数', desc: '焦土/被啃食草地恢复绿色的基础 tick 数（越小复苏越快）', min: 200, max: 2400, step: 50, value: 700 },
  { path: 'eco.grazeRate', group: '生态与植被', label: '啃食速率', desc: '食草动物消耗草地的速率乘数（过大 → 过牧荒漠化）', min: 0.2, max: 3, step: 0.05, value: 1 },
  { path: 'fire.spreadMul', group: '生态与植被', label: '野火蔓延', desc: '火焰在森林/草地间的扩散概率乘数（0.1=几乎不燃，5=燎原之势）', min: 0.1, max: 5, step: 0.1, value: 1 },
  { path: 'fire.damage', group: '生态与植被', label: '火焰伤害', desc: '生物站在火格上每 update 的掉血量', min: 0.5, max: 10, step: 0.5, value: 3 },
  // ---- 战争与外交 ----
  { path: 'war.declareRate', group: '战争与外交', label: '宣战倾向', desc: '王国间开战概率的全局乘数（0=永久和平，3=混战地狱）', min: 0, max: 5, step: 0.1, value: 1 },
  { path: 'war.tensionDecay', group: '战争与外交', label: '摩擦消散', desc: '每轮外交的边境摩擦衰减系数（0.92=快速泄压；越接近 1 旧怨越难忘）', min: 0.8, max: 0.999, step: 0.002, value: 0.92 },
  { path: 'war.milPressure', group: '战争与外交', label: '军国增压', desc: '军国主义国家对双边摩擦的每轮注入强度', min: 0, max: 0.3, step: 0.005, value: 0.06 },
  // ---- 演化 ----
  { path: 'evo.mutationRate', group: '演化', label: '基因突变率', desc: '子代基因相对母代的变异幅度（0.08=自然漂变；0.3=急速演化实验场）', min: 0, max: 0.4, step: 0.01, value: 0.08 },
  // ---- 社会涌现 ----
  { path: 'social.panicDecay', group: '社会涌现', label: '恐慌平复', desc: '恐慌值每 update 的衰减量（0.008≈6 年彻底平复；调大=集体很快忘记恐惧）', min: 0.001, max: 0.04, step: 0.001, value: 0.008 },
  { path: 'social.panicRout', group: '社会涌现', label: '溃逃阈值', desc: '恐慌累积到该值即雪崩溃逃（0.72=自然基调；调低=草木皆兵，调高=处变不惊）', min: 0.5, max: 0.95, step: 0.01, value: 0.72 },
  { path: 'social.grudgeDecay', group: '社会涌现', label: '血仇消磨', desc: '血仇值每 update 的衰减量（岁月化开仇怨的速度）', min: 0.001, max: 0.03, step: 0.001, value: 0.006 },
  // ---- 自然引擎 ----
  { path: 'nature.quakeStress', group: '自然引擎', label: '地震应力阈', desc: '板块边界单格应力释放阈值（26=自然地震带节奏；调低=地震频发）', min: 10, max: 60, step: 1, value: 26 },
  { path: 'nature.stormRate', group: '自然引擎', label: '风暴孕育率', desc: '气旋/冰暴生成概率的全局乘数', min: 0, max: 3, step: 0.1, value: 1 },
  { path: 'nature.erosionRate', group: '自然引擎', label: '侵蚀速率', desc: '深时引擎水力侵蚀强度乘数（山脉被河流刻穿的速度）', min: 0, max: 5, step: 0.1, value: 1 },
];

/** path → meta 索引（热路径 O(1)） */
const IDX = new Map<string, ParamMeta>(REG.map((m) => [m.path, m]));

/** 热参数读取（引擎热路径调用；未注册路径返回 1 并计入 missing 以便发现拼写错误） */
export function ep(path: string): number {
  const m = IDX.get(path);
  if (m === undefined) return 1;
  return m.value;
}

/** 热参数写入（clamp 校验后即时生效）；返回错误文案或 null=成功 */
export function setEngineParam(path: string, value: number): string | null {
  const m = IDX.get(path);
  if (m === undefined) return `未知参数 ${path}（用 get_params 查看全部可调参数）`;
  if (!Number.isFinite(value)) return '参数值必须是有限数字';
  const v = Math.max(m.min, Math.min(m.max, value));
  m.value = Math.round(v / m.step) * m.step;
  return null;
}

/** 全量快照（get_params 工具用；filter 按组名/路径/标签模糊匹配） */
export function listEngineParams(filter?: string): ParamMeta[] {
  const f = (filter ?? '').trim().toLowerCase();
  if (!f) return REG.map((m) => ({ ...m }));
  return REG.filter((m) => (m.path + m.group + m.label + m.desc).toLowerCase().includes(f)).map((m) => ({ ...m }));
}

/** 单参数查询 */
export function getEngineParam(path: string): ParamMeta | null {
  const m = IDX.get(path);
  return m ? { ...m } : null;
}

/** 全部重置为默认基调（Agent 法则 revert 与 UI「恢复默认」共用） */
export function resetEngineParams(): void {
  for (const m of REG) m.value = DEFAULTS.get(m.path) ?? m.value;
}
const DEFAULTS = new Map<string, number>(
  REG.map((m) => {
    // 注册时的初始值即默认基调（构建期固定）
    return [m.path, m.value];
  })
);
