// ============================================================================
// WbAgentLaws.cs —— M-U28「Agent 法则系统 v2 结算面」（TickOrch 槽 60 语义）
// 蓝本 src/lib/game/agentLaws.ts（机械同构，行号锚逐段标注）+ engineParams.ts（数据面）。
//
// 切片边界（挂账注记，docs/UNITY_MIGRATION.md 同步）：
//   · create/update/normalizeTrigger/normalizeLaw/list 属工具/存档面（法则夹具由
//     NUnit 手术式直写注入，不经 create——gen-power radSet 注入先例）——下一轮点亮；
//   · WBB.touchMeta（槽 59 前半）未译维持 no-op（WbTickOrch L195-196 双槽同门已预埋）；
//   · DIVERGENCE-1：C# ep() 热路径未接线（引擎各域内联默认值）——param 动作只改
//     WbEngineParams 注册表值，下游模拟效应为后续接线挂账（黄金场景不受影响——
//     结算面可观测面 = 注册表值 + revert 账本，位级对账成立）；
//   · DIVERGENCE-2：terrain/fire 动作的半径写面在 JS 侧存在「类型数组非整数索引丢弃」
//     怪癖（yy*W+xx 非整数 → 写入被忽略）——黄金场景半径全取整数值（optI/定点坐标），
//     非整数半径面列长尾挂账（validateActions num() 不取整是怪癖源头）；
//   · DIVERGENCE-3：计数值字符串 |v|<1e-7 的 JS 指数形态（String(1e-7)='1e-7' vs C#
//     定点 '1E-07'）——场景值域避开，列长尾挂账。
// ============================================================================
using System;
using System.Collections.Generic;
using System.Globalization;

namespace PixelWorldBox.Wb
{
    // ================= 数据形状（agentLaws.ts L14 types 镜像） =================

    /// <summary>条件表达式树（validateCond L94-122 产出形状；not 的 sub 为单表达式——L129 传 c.sub 直入）</summary>
    public sealed class WbCondExpr
    {
        public string op;                                        // and/or/not/gt/lt/gte/lte/eq
        public List<WbCondExpr> sub = new List<WbCondExpr>();    // and/or 分支
        public WbCondExpr subOne;                                // not 分支（单表达式）
        public string stat;                                      // 比较分支统计键
        public double value;                                     // 比较分支阈值
    }

    /// <summary>机制触发器（normalizeTrigger 产出形状；everyYears/eventCooldownYears 的 JS undefined → null）</summary>
    public sealed class WbMechTrigger
    {
        public string kind;                    // cron/event/condition
        public double? everyYears;             // cron/condition 恒有值；event 型 undefined → null（L477 改写面）
        public double chance = 1;
        public int? season;                    // JS null → null（0-3 或 null）
        public string @event;                  // event 型（C# 保留字 @ 转义——JS 字段名 event 镜像）
        public double? eventCooldownYears;     // event 型恒有值
        public WbCondExpr cond;                // condition 型（JS undefined → null）
    }

    /// <summary>机制动作（AgentLawAction 联合的平铺镜像；字段缺席 = JS undefined → null/0）</summary>
    public sealed class WbLawAction
    {
        public string kind;
        public double? x, y;                   // optI 产出（整数语义）或 undefined
        public double? power, count, radius;   // num clampN 产出（恒有值——各 kind 校验面）
        public string weather, race, terrain, path, text, action, target, name, op;
        public double value;                   // param/counter（校验面强制有限数）
    }

    /// <summary>单条机制（AgentLaw 镜像；fired/lastYear JS 数值语义）</summary>
    public sealed class WbAgentLaw
    {
        public string id, name, desc;
        public bool enabled = true;
        public double createdYear;
        public double? durationYears;          // JS null → null（null = 永久）
        public WbMechTrigger trigger;
        public List<WbLawAction> actions = new List<WbLawAction>();
        public int fired;                      // JS fired++（整数域）
        public double lastYear;
        public Dictionary<string, double> revert = new Dictionary<string, double>();   // param 改前值账本
    }

    /// <summary>法则结算结果（LawFireReport L50-55——工具回传给 Agent 的证据）</summary>
    public sealed class WbLawFireReport
    {
        public string id, name;
        public List<string> firedActions = new List<string>();
        public List<string> detail = new List<string>();
    }

    // ================= 引擎热参数注册表（engineParams.ts L25-33 REG 机械转写） =================
    // DIVERGENCE-1：C# 引擎热路径未消费本表（各域内联默认值）——param 动作/还原账本的可观测面
    // 与 JS 位级一致，下游模拟效应接线为后续挂账。
    public static class WbEngineParams
    {
        public sealed class Meta
        {
            public string path, group, label, desc;
            public double min, max, step, value;
        }

        /// <summary>参数表（有序数组——注册顺序即展示顺序；engineParams.ts L25-41）</summary>
        public static readonly List<Meta> Reg = new List<Meta>
        {
            new Meta{ path="pop.reproMul", group="人口与繁衍", label="繁衍倍率", desc="全体生物繁衍概率的全局乘数（1=自然基调；>1 人口爆炸，<1 走向绝育）", min=0.1, max=3, step=0.05, value=1 },
            new Meta{ path="eco.regrowBase", group="生态与植被", label="植被复苏基数", desc="焦土/被啃食草地恢复绿色的基础 tick 数（越小复苏越快）", min=200, max=2400, step=50, value=700 },
            new Meta{ path="eco.grazeRate", group="生态与植被", label="啃食速率", desc="食草动物消耗草地的速率乘数（过大 → 过牧荒漠化）", min=0.2, max=3, step=0.05, value=1 },
            new Meta{ path="fire.spreadMul", group="生态与植被", label="野火蔓延", desc="火焰在森林/草地间的扩散概率乘数（0.1=几乎不燃，5=燎原之势）", min=0.1, max=5, step=0.1, value=1 },
            new Meta{ path="fire.damage", group="生态与植被", label="火焰伤害", desc="生物站在火格上每 update 的掉血量", min=0.5, max=10, step=0.5, value=3 },
            new Meta{ path="war.declareRate", group="战争与外交", label="宣战倾向", desc="王国间开战概率的全局乘数（0=永久和平，3=混战地狱）", min=0, max=5, step=0.1, value=1 },
            new Meta{ path="war.tensionDecay", group="战争与外交", label="摩擦消散", desc="每轮外交的边境摩擦衰减系数（0.92=快速泄压；越接近 1 旧怨越难忘）", min=0.8, max=0.999, step=0.002, value=0.92 },
            new Meta{ path="war.milPressure", group="战争与外交", label="军国增压", desc="军国主义国家对双边摩擦的每轮注入强度", min=0, max=0.3, step=0.005, value=0.06 },
            new Meta{ path="evo.mutationRate", group="演化", label="基因突变率", desc="子代基因相对母代的变异幅度（0.08=自然漂变；0.3=急速演化实验场）", min=0, max=0.4, step=0.01, value=0.08 },
            new Meta{ path="social.panicDecay", group="社会涌现", label="恐慌平复", desc="恐慌值每 update 的衰减量（0.008≈6 年彻底平复；调大=集体很快忘记恐惧）", min=0.001, max=0.04, step=0.001, value=0.008 },
            new Meta{ path="social.panicRout", group="社会涌现", label="溃逃阈值", desc="恐慌累积到该值即雪崩溃逃（0.72=自然基调；调低=草木皆兵，调高=处变不惊）", min=0.5, max=0.95, step=0.01, value=0.72 },
            new Meta{ path="social.grudgeDecay", group="社会涌现", label="血仇消磨", desc="血仇值每 update 的衰减量（岁月化开仇怨的速度）", min=0.001, max=0.03, step=0.001, value=0.006 },
            new Meta{ path="nature.quakeStress", group="自然引擎", label="地震应力阈", desc="板块边界单格应力释放阈值（26=自然地震带节奏；调低=地震频发）", min=10, max=60, step=1, value=26 },
            new Meta{ path="nature.stormRate", group="自然引擎", label="风暴孕育率", desc="气旋/冰暴生成概率的全局乘数", min=0, max=3, step=0.1, value=1 },
            new Meta{ path="nature.erosionRate", group="自然引擎", label="侵蚀速率", desc="深时引擎水力侵蚀强度乘数（山脉被河流刻穿的速度）", min=0, max=5, step=0.1, value=1 },
        };

        private static readonly Dictionary<string, int> Idx = BuildIdx();
        private static Dictionary<string, int> BuildIdx()
        {
            var d = new Dictionary<string, int>();
            for (int i = 0; i < Reg.Count; i++) d[Reg[i].path] = i;
            return d;
        }

        /// <summary>热参数写入（clamp 校验后即时生效）；返回错误文案或 null=成功（engineParams.ts L57-65）</summary>
        public static string Set(string path, double value)
        {
            if (!Idx.TryGetValue(path, out int i)) return $"未知参数 {path}（用 get_params 查看全部可调参数）";
            if (!double.IsFinite(value)) return "参数值必须是有限数字";
            Meta m = Reg[i];
            double v = Math.Max(m.min, Math.Min(m.max, value));
            m.value = WbMath.JsRound(v / m.step) * m.step;    // JS Math.round 半进位（WbMath.JsRound 同构）
            return null;
        }

        /// <summary>单参数查询（getEngineParam L79-81——元数据副本含当前值）</summary>
        public static Meta Get(string path)
        {
            return Idx.TryGetValue(path, out int i)
                ? new Meta { path = Reg[i].path, group = Reg[i].group, label = Reg[i].label, desc = Reg[i].desc, min = Reg[i].min, max = Reg[i].max, step = Reg[i].step, value = Reg[i].value }
                : null;
        }

        /// <summary>全部重置为默认基调（resetEngineParams L84-87；场景间复位/det 双跑前置条件）</summary>
        public static void Reset()
        {
            // 注册时的初始值即默认基调（构建期固定——Reg 初始化值 = 默认值，复位即重写 value）
            double[] defaults = { 1, 700, 1, 1, 3, 1, 0.92, 0.06, 0.08, 0.008, 0.72, 0.006, 26, 1, 1 };
            for (int i = 0; i < Reg.Count; i++) Reg[i].value = defaults[i];
        }
    }

    // ================= 系统本体（AgentLawSystem L323-895 机械同构） =================
    public sealed class WbAgentLaws
    {
        public readonly WbWorld w;                                              // eng
        public List<WbAgentLaw> laws = new List<WbAgentLaw>();                  // L325
        public int seq = 1;                                                     // L326
        /// <summary>v2：自定义计数器（counter 动作维护、条件 DSL 用 counter:名 读取；随存档走）</summary>
        public Dictionary<string, double> counters = new Dictionary<string, double>();   // L328
        /// <summary>v2：重入保护——fire 执行期间为 true，onEvent 见之即退（神力会再 addEvent，防无限递归）</summary>
        private bool firing;                                                    // L330
        /// <summary>v2：世界统计惰性快照（同一结算内复用；fire 改变世界 / 跨 tick 即作废）；null = JS null</summary>
        private Dictionary<string, double> statsCache;                          // L332
        private int statsTick = -1;                                             // L333

        public WbAgentLaws(WbWorld eng) { w = eng; }                            // L335-337

        // ---------------- tick（L524-557 机械同构） ----------------
        /// <summary>每 120 tick 结算（引擎 tick 调度槽 60）：cron 年轮门槛 + condition 条件轮询；
        /// event 型在此无事可做。单次结算全局 fire 预算 ≤6（防性能雪崩）。</summary>
        public void Tick()
        {
            if (laws.Count == 0) return;                                        // L525
            double year = Math.Floor(w.yearF);                                  // L527
            statsCache = null;                                                  // L528 新一轮结算：统计快照重建
            int budget = 6;                                                     // L529
            var snapshot = new List<WbAgentLaw>(laws);                          // L530 快照遍历：到期移除会 splice
            foreach (var law in snapshot)
            {
                if (!law.enabled) continue;                                     // L531
                // 到期移除
                if (law.durationYears != null && year - law.createdYear >= law.durationYears.Value)   // L533
                {
                    Remove(law.id, false);                                      // L534
                    w.AddEvent("oracle", $"法则「{law.name}」的时效已尽，悄然消散于风中", null, null, null);   // L535
                    continue;
                }
                WbMechTrigger tg = law.trigger;                                 // L538
                if (tg.kind == "event") continue;                               // L539 事件型由 addEvent 钩子驱动
                if (budget <= 0) continue;                                      // L540
                if (tg.kind == "condition")
                {
                    if (year - law.lastYear < (tg.everyYears ?? 1)) continue;   // L542 两次触发的最小间隔
                    if (tg.season != null && w.NatureSeason() != tg.season.Value) continue;   // L543
                    if (tg.cond == null || !EvalCond(tg.cond)) continue;        // L544
                    if (w.Rng() > tg.chance) continue;                          // L545（chance 归一化恒有值——JS ?? 1 死分支）
                }
                else
                {
                    if (year - law.lastYear < (tg.everyYears ?? 10)) continue;  // L547
                    if (tg.season != null && w.NatureSeason() != tg.season.Value) continue;   // L548
                    if (w.Rng() > tg.chance) continue;                          // L549（chance 归一化恒有值——JS ?? 1 死分支）
                }
                law.lastYear = year;                                            // L551
                law.fired++;                                                    // L552
                budget--;                                                       // L553
                WbLawFireReport report = Fire(law, null, null);                 // L554
                if (report != null)
                    w.AddEvent("oracle", $"法则「{law.name}」降临：{JoinDetails(report.detail, 3)}", null, null, null);   // L555
            }
        }

        /// <summary>detail.slice(0, n).join('；')（L555/L580 共用；JS join 中文分号）</summary>
        private static string JoinDetails(List<string> detail, int n)
        {
            int m = Math.Min(n, detail.Count);
            var parts = new string[m];
            for (int i = 0; i < m; i++) parts[i] = detail[i];
            return string.Join("；", parts);
        }

        /// <summary>JS String(Math.round(v))——坐标整数字符串（invariant；事件文案对账面）</summary>
        private static string RS(double v) => WbMath.JsRound(v).ToString(CultureInfo.InvariantCulture);

        // ---------------- onEvent（L562-582 机械同构） ----------------
        /// <summary>v2：事件总线入口（引擎 addEvent 钩子调用，WbWorld.AddEvent 尾部）——event 型机制
        /// 在此感应世界脉动。重入保护是安全命门：fire 里的神力会再 addEvent，没有它就是无限递归。
        /// 未指定坐标的动作落在事件发生地（如王国覆灭处 spawn 恶魔）。单事件最多触发 4 条。</summary>
        public void OnEvent(string kind, double? x, double? y)                  // WorldEventKind = string
        {
            if (firing) return;                                                 // L563
            if (laws.Count == 0) return;                                        // L564
            double year = Math.Floor(w.yearF);                                  // L566
            statsCache = null;                                                  // L567
            int n = 0;                                                          // L568
            var snapshot = new List<WbAgentLaw>(laws);                          // L569
            foreach (var law in snapshot)
            {
                if (n >= 4) break;                                              // L570
                if (!law.enabled) continue;                                     // L571
                WbMechTrigger tg = law.trigger;                                 // L572
                if (tg.kind != "event" || tg.@event != kind) continue;          // L573
                if (year - law.lastYear < (tg.eventCooldownYears ?? 1)) continue;   // L574
                if (w.Rng() > tg.chance) continue;                              // L575（chance 归一化恒有值——JS ?? 1 死分支）
                law.lastYear = year;                                            // L576
                law.fired++;                                                    // L577
                n++;                                                            // L578
                WbLawFireReport report = Fire(law, x, y);                       // L579
                if (report != null)
                    w.AddEvent("oracle", $"法则「{law.name}」感应世界脉动而发动：{JoinDetails(report.detail, 3)}", null, null, null);   // L580
            }
        }

        // ---------------- statValue / buildStats（L585-629 机械同构） ----------------
        /// <summary>v2：世界统计键（条件 DSL 的数据源）。16 个内置键 + counter:NAME 自定义计数器；未知键返回 NaN。</summary>
        public double StatValue(string key)
        {
            if (key.StartsWith("counter:", StringComparison.Ordinal))           // L586
                return counters.TryGetValue(key.Substring(8), out double cv) ? cv : 0;   // ?? 0
            if (statsCache == null || statsTick != w.tickCount)                 // L587
            {
                statsCache = BuildStats();                                      // L588
                statsTick = w.tickCount;                                        // L589
            }
            return statsCache.TryGetValue(key, out double v) ? v : double.NaN;  // L591-592 未知键 → NaN
        }

        /// <summary>全景统计（units 单遍历合并产出；soilAvg 与深时引擎 deepSnapshot 同口径）</summary>
        private Dictionary<string, double> BuildStats()
        {
            double pop = 0, wildlife = 0, herbivores = 0, predators = 0, panicking = 0, feuds = 0;   // L598
            foreach (var u in w.units)                                          // L599
            {
                if (u.dead != 0) continue;                                      // L600
                bool hasDef = u.race >= 0 && u.race < WbBailRelay.RStats.Length;   // L601 RACES[u.race]（越界 → JS undefined 双假面）
                if (hasDef && WbBailRelay.RStats[u.race].isCiv) pop++;          // L602
                else wildlife++;                                                // L603
                if (WbBailRelay.IsHerbivoreRace(w, u.race)) herbivores++;       // L604（M-U28 可见性放宽 private→internal）
                if (hasDef && WbBailRelay.RStats[u.race].predator) predators++; // L605
                if ((u.panic ?? 0) >= 0.5) panicking++;                         // L606
                if (u.gIdsN != null) feuds += u.gIdsN.Count;                    // L607 u.gIds?.length（gIdsN 镜像——undefined 与空表分离）
            }
            double kingdoms = 0;                                                // L609
            foreach (var c in w.civs) if (c.alive) kingdoms++;                  // L610
            int N = WbWorld.W * WbWorld.H;                                      // L611
            double soil = 0, land = 0;                                          // L612
            for (int i = 0; i < N; i++)
            {
                if (!WbWorld.IsWater(w.terrain[i])) { soil += w.soilF[i]; land++; }   // L613-615
            }
            var st = new Dictionary<string, double>();                          // L616-628（插入序 = JS 对象键序）
            st["year"] = Math.Floor(w.yearF);
            st["pop"] = pop; st["wildlife"] = wildlife; st["herbivores"] = herbivores;
            st["predators"] = predators; st["panicking"] = panicking; st["feuds"] = feuds;
            st["kingdoms"] = kingdoms;
            st["wars"] = w.warData.Count;
            st["families"] = w.families.Count;
            st["globalTemp"] = w.globalTemp;
            st["seaLevel"] = w.seaLevel;
            st["glacierArea"] = w.glacierTiles / (double)N;
            st["soilAvg"] = land > 0 ? soil / land : 0;
            st["wildRaces"] = w.dynRaces.Count;
            st["fires"] = w.fireSet.Count;
            return st;
        }

        // ---------------- evalCond（L632-634 实例口径 + L125-143 模块级纯函数） ----------------
        /// <summary>v2：条件树求值（类实例口径——statValue 数据源；NaN 一律判 false）</summary>
        public bool EvalCond(WbCondExpr c) => EvalCond(c, StatValue);

        /// <summary>条件树求值（纯函数；stat 提供统计键 → 数值）。and/or 空 sub 视为 true/false；NaN 一律判 false。</summary>
        public static bool EvalCond(WbCondExpr c, Func<string, double> stat)
        {
            switch (c.op)
            {
                case "and":                                                     // L127 every
                    foreach (var s in c.sub) if (!EvalCond(s, stat)) return false;
                    return true;
                case "or":                                                      // L128 some
                    foreach (var s in c.sub) if (EvalCond(s, stat)) return true;
                    return false;
                case "not":                                                     // L129
                    return !EvalCond(c.subOne, stat);
                default:                                                        // L130-141 比较分支
                {
                    double v = stat(c.stat);
                    if (!double.IsFinite(v)) return false;                      // L133 未知统计键 → NaN → 判 false
                    switch (c.op)
                    {
                        case "gt": return v > c.value;
                        case "lt": return v < c.value;
                        case "gte": return v >= c.value;
                        case "lte": return v <= c.value;
                        default: return Math.Abs(v - c.value) < 1e-9;           // L139 eq：浮点安全等值
                    }
                }
            }
        }

        // ---------------- remove / toggle / revertParams（L496-520 机械同构） ----------------
        /// <summary>移除（还原 param 动作；announce 是否播报）</summary>
        public bool Remove(string id, bool announce = true)
        {
            int k = laws.FindIndex((l) => l.id == id);                          // L497
            if (k < 0) return false;
            WbAgentLaw law = laws[k];
            RevertParams(law);                                                  // L500
            laws.RemoveAt(k);                                                   // L501 splice(k, 1)
            if (announce) w.AddEvent("oracle", $"法则「{law.name}」被废止，世界恢复旧秩序", null, null, null);   // L502
            return true;
        }

        public bool Toggle(string id, bool enabled)
        {
            WbAgentLaw law = laws.Find((l) => l.id == id);                      // L507
            if (law == null) return false;
            if (law.enabled && !enabled) RevertParams(law);                     // L509 停用即还原 param 修改
            law.enabled = enabled;
            return true;
        }

        /// <summary>还原 param 动作（改前值账本）</summary>
        private void RevertParams(WbAgentLaw law)
        {
            foreach (var a in law.actions)
            {
                if (a.kind == "param" && law.revert.ContainsKey(a.path))        // L517 revert[a.path] !== undefined
                    WbEngineParams.Set(a.path, law.revert[a.path]);
            }
            law.revert.Clear();                                                 // L519 = {}
        }

        // ---------------- TERRAIN_MAP（L57-60） ----------------
        private static readonly Dictionary<string, byte> TerrainMap = new Dictionary<string, byte>
        {
            { "water", WbWorld.T_WATER }, { "deep", WbWorld.T_DEEP }, { "sand", WbWorld.T_SAND },
            { "grass", WbWorld.T_GRASS }, { "forest", WbWorld.T_FOREST }, { "hill", WbWorld.T_HILL },
            { "mountain", WbWorld.T_MOUNTAIN }, { "snow", WbWorld.T_SNOW }, { "burnt", WbWorld.T_BURNT },
            { "lava", WbWorld.T_LAVA }, { "ice", WbWorld.T_ICE },
        };

        // ---------------- 种族名解析表（resolveRace L70-87 数据面——types.ts R/RACES 机械转写） ----------------
        /// <summary>R 键声明序（Object.keys(R) 迭代序 = 精确 key 匹配序）</summary>
        private static readonly (string key, int id)[] RKeyOrder =
        {
            ("HUMAN",0), ("ELF",1), ("DWARF",2), ("ORC",3), ("BANDIT",4), ("ZOMBIE",5), ("SHEEP",6),
            ("WOLF",7), ("BEAR",8), ("DRAGON",9), ("DEER",10), ("PENGUIN",11), ("CAMEL",12), ("SCORPION",13),
            ("SNAKE",14), ("SNOWWOLF",15), ("SKELETON",16), ("DEMON",17), ("MAGE",18), ("LIZARD",19),
            ("GOBLIN",20), ("TROLL",21), ("OGRE",22), ("WHITEWALKER",23), ("VAMPIRE",24), ("KRAKEN",25),
            ("SANDWORM",26), ("BASILISK",27), ("ANGEL",28), ("PHOENIX",29), ("ENT",30), ("LICH",31),
            ("HYDRA",32), ("CHICKEN",33), ("PIG",34), ("RABBIT",35), ("FOX",36), ("FISH",37), ("CRAB",38),
            ("TURTLE",39), ("SHARK",40),
        };
        /// <summary>RACES key/name（id 升序 = Object.entries(RACES) 数值键迭代序；中文名对账面）</summary>
        private static readonly (string key, string name)[] RaceNames =
        {
            ("human","人类"), ("elf","精灵"), ("dwarf","矮人"), ("orc","兽人"), ("bandit","强盗"),
            ("zombie","僵尸"), ("sheep","绵羊"), ("wolf","狼"), ("bear","熊"), ("dragon","巨龙"),
            ("deer","鹿"), ("penguin","企鹅"), ("camel","骆驼"), ("scorpion","蝎子"), ("snake","蛇"),
            ("snowwolf","雪狼"), ("skeleton","骷髅"), ("demon","恶魔"), ("mage","法师"), ("lizard","蜥蜴人"),
            ("goblin","哥布林"), ("troll","巨魔"), ("ogre","食人魔"), ("whitewalker","白行者"), ("vampire","吸血鬼"),
            ("kraken","克拉肯"), ("sandworm","沙虫"), ("basilisk","蛇怪"), ("angel","天使"), ("phoenix","凤凰"),
            ("ent","树人"), ("lich","巫妖"), ("hydra","九头蛇"), ("chicken","鸡"), ("pig","猪"),
            ("rabbit","兔"), ("fox","狐"), ("fish","鱼"), ("crab","蟹"), ("turtle","龟"), ("shark","鲨鱼"),
        };

        /// <summary>种族名 → race id（中文/英文/key 模糊匹配，如 "人族"/"羊"/"wolf"/"DRAGON"）；null = 未命中</summary>
        public static int? ResolveRace(string name)
        {
            string q = (name ?? "").Trim().ToLowerInvariant();                  // L71
            if (q.Length == 0) return null;                                     // L72
            // 1) 精确 key
            foreach (var (key, id) in RKeyOrder)                                // L74-76
                if (key.ToLowerInvariant() == q) return id;
            // 2) 中文名 / 英文名包含（Object.entries(RACES) 数值键升序）
            for (int id = 0; id < RaceNames.Length; id++)                       // L78-81
            {
                if (RaceNames[id].name == name || RaceNames[id].key.ToLowerInvariant() == q || RaceNames[id].name.ToLowerInvariant() == q)
                    return id;
            }
            // 3) 首个名称包含匹配（"雪狼"→"雪狼"）
            for (int id = 0; id < RaceNames.Length; id++)                       // L83-85
            {
                if (RaceNames[id].name.Contains(q) || RaceNames[id].key.ToLowerInvariant().Contains(q))
                    return id;
            }
            return null;                                                        // L86
        }

        // ---------------- fire（L638-875 机械同构——39 动作分发） ----------------
        /// <summary>执行一条机制的全部动作（工具「试运行」也直接调用它）。
        /// evX/evY：事件触发时的发生地坐标——动作未指定坐标时优先落到事件发生地，否则沿用随机缺省。</summary>
        public WbLawFireReport Fire(WbAgentLaw law, double? evX = null, double? evY = null)
        {
            var fired = new List<string>();                                     // L640
            var detail = new List<string>();                                    // L641
            bool wasFiring = firing;                                            // L642
            firing = true;                                                      // L643 重入保护置位（finally 复位——嵌套调用时还原外层状态）
            try                                                                 // L644
            {
                foreach (var a in law.actions)                                  // L645
                {
                    double? px = a.x != null ? a.x : evX;                       // L646 'x' in a && a.x !== undefined（平铺镜像等价：无 x 字段/undefined → evX）
                    double? py = a.y != null ? a.y : evY;                       // L647
                    double x = px != null ? px.Value : 8 + Math.Floor(w.Rng() * (WbWorld.W - 16));   // L648 定点横坐标：动作指定 > 事件地 > 随机
                    double y = py != null ? py.Value : 6 + Math.Floor(w.Rng() * (WbWorld.H - 12));   // L649
                    switch (a.kind)
                    {
                        case "meteor":                                          // L651-654
                            WbBailRelay.Meteor(w, x, y);
                            fired.Add("meteor"); detail.Add($"陨石坠于({RS(x)},{RS(y)})");
                            break;
                        case "quake":                                           // L655-658
                            WbBailRelay.NatureQuake(w, x, y, 4.5 + (a.power ?? 2) * 1.4);
                            fired.Add("quake"); detail.Add($"M{(4.5 + (a.power ?? 2) * 1.4).ToString("F1", CultureInfo.InvariantCulture)}地震震中({RS(x)},{RS(y)})");
                            break;
                        case "volcano":                                         // L659-662
                            WbBailRelay.Volcano(w, x, y, a.power ?? 2);
                            fired.Add("volcano"); detail.Add($"火山喷发({RS(x)},{RS(y)})");
                            break;
                        case "lightning":                                       // L663-666
                            WbBailRelay.Lightning(w, x, y, a.count ?? 4);
                            fired.Add("lightning"); detail.Add($"{(a.count ?? 4).ToString(CultureInfo.InvariantCulture)}道天罚落点({RS(x)},{RS(y)})");
                            break;
                        case "tornado":                                         // L667-670
                            WbBailRelay.SpawnTornado(w, x, y, a.count ?? 1);
                            fired.Add("tornado"); detail.Add($"{(a.count ?? 1).ToString(CultureInfo.InvariantCulture)}股龙卷风({RS(x)},{RS(y)})");
                            break;
                        case "tsunami":                                         // L671-674
                            WbBailRelay.Tsunami(w, x, y, a.radius ?? 6);
                            fired.Add("tsunami"); detail.Add($"海啸浪级{(a.radius ?? 6).ToString(CultureInfo.InvariantCulture)}({RS(x)},{RS(y)})");
                            break;
                        case "drought":                                         // L675-678
                            WbBailRelay.Drought(w, x, y, a.radius ?? 6);
                            fired.Add("drought"); detail.Add($"干旱半径{(a.radius ?? 6).ToString(CultureInfo.InvariantCulture)}({RS(x)},{RS(y)})");
                            break;
                        case "flood":                                           // L679-682
                            WbBailRelay.NatureFlood(w, x, y);
                            fired.Add("flood"); detail.Add($"洪水泛滥({RS(x)},{RS(y)})");
                            break;
                        case "blizzard":                                        // L683-686
                            WbBailRelay.Blizzard(w, x, y, a.radius ?? 6);
                            fired.Add("blizzard"); detail.Add($"暴风雪半径{(a.radius ?? 6).ToString(CultureInfo.InvariantCulture)}({RS(x)},{RS(y)})");
                            break;
                        case "weather":                                         // L687-696
                            if (a.weather == "rain")
                            {
                                // 唤雨：区域内灭火 + 复苏（甘霖）
                                WbBailRelay.HealArea(w, x, y, a.radius ?? 5);
                                fired.Add("rain"); detail.Add($"甘霖降落({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            }
                            else
                            {
                                WbBailRelay.Sandstorm(w, x, y, a.radius ?? 5);
                                fired.Add("sandstorm"); detail.Add($"沙暴肆虐({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            }
                            break;
                        case "spawn":                                           // L697-710
                        {
                            int? rid = ResolveRace(a.race);                     // L698
                            if (rid == null) break;                             // L699
                            double cnt = a.count ?? 5;                          // L700
                            int n = 0;                                          // L701
                            for (int k = 0; k < cnt; k++)                       // L702
                            {
                                double sx = px != null ? px.Value + (w.Rng() - 0.5) * 4 : 4 + w.Rng() * (WbWorld.W - 8);   // L703
                                double sy = py != null ? py.Value + (w.Rng() - 0.5) * 4 : 4 + w.Rng() * (WbWorld.H - 8);   // L704
                                WbBailRelay.SpawnUnit(w, rid.Value, sx, sy, new WbBailRelay.WbSpawnOpts { silent = true });   // L705
                                n++;                                            // L706
                            }
                            fired.Add("spawn"); detail.Add($"{(rid.Value >= 0 && rid.Value < RaceNames.Length ? RaceNames[rid.Value].name : "?")}×{n}降临({RS(x)},{RS(y)})");   // L708
                            break;
                        }
                        case "terrain":                                         // L711-726
                        {
                            if (!TerrainMap.TryGetValue(a.terrain, out byte t)) break;   // L712-713 undefined → break
                            double rad = a.radius ?? 3;                         // L714
                            int n = 0;                                          // L715
                            double r2 = rad * rad;                              // L716
                            // 场景契约：radius/坐标取整数值（DIVERGENCE-2——非整数半径的 JS 类型数组
                            // 非整数索引丢弃怪癖不在本轮切片）
                            for (int yy = Math.Max(0, (int)(y - rad)); yy <= Math.Min(WbWorld.H - 1, (int)(y + rad)); yy++)   // L717
                            {
                                for (int xx = Math.Max(0, (int)(x - rad)); xx <= Math.Min(WbWorld.W - 1, (int)(x + rad)); xx++)   // L718
                                {
                                    if ((xx - x) * (xx - x) + (yy - y) * (yy - y) > r2) continue;   // L719
                                    WbBailRelay.SetTerrain(w, yy * WbWorld.W + xx, t);   // L720
                                    n++;                                        // L721
                                }
                            }
                            fired.Add("terrain"); detail.Add($"{a.terrain}改地{n}格({RS(x)},{RS(y)})");   // L724
                            break;
                        }
                        case "bless":                                           // L727-730
                            WbBailRelay.BlessArea(w, x, y, a.radius ?? 5);
                            fired.Add("bless"); detail.Add($"神恩祝福({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "heal":                                            // L731-734
                            WbBailRelay.HealArea(w, x, y, a.radius ?? 5);
                            fired.Add("heal"); detail.Add($"治疗神力({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "smite":                                           // L735-745
                        {
                            double rad = a.radius ?? 5;
                            int n = 0;
                            double r2 = rad * rad;
                            foreach (var u in w.units)                          // L739
                            {
                                if (u.dead != 0) continue;                      // L740
                                if ((u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) <= r2) { u.hp = 0; n++; }   // L741
                            }
                            fired.Add("smite"); detail.Add($"神罚诛灭{n.ToString(CultureInfo.InvariantCulture)}个生物({RS(x)},{RS(y)})");
                            break;
                        }
                        case "param":                                           // L746-754
                        {
                            if (!law.revert.ContainsKey(a.path))                // L747
                            {
                                var cur = WbEngineParams.Get(a.path);           // L748
                                if (cur != null) law.revert[a.path] = cur.value;   // L749 记账改前值
                            }
                            WbEngineParams.Set(a.path, a.value);                // L751（返回错误文案被 JS 侧忽略——同构）
                            fired.Add("param"); detail.Add($"{a.path}→{a.value.ToString(CultureInfo.InvariantCulture)}");
                            break;
                        }
                        case "announce":                                        // L755-758
                            w.AddEvent("oracle", a.text, null, null, null);
                            fired.Add("announce"); detail.Add("神谕宣告");
                            break;
                        // ---------------- v2：15 种神力 ----------------
                        case "meteor_shower":                                   // L760-763
                            WbBailRelay.MeteorShower(w, x, y, a.radius ?? 6, a.count ?? 6);
                            fired.Add("meteor_shower"); detail.Add($"陨石雨{(a.count ?? 6).ToString(CultureInfo.InvariantCulture)}颗砸落({RS(x)},{RS(y)})");
                            break;
                        case "typhoon":                                         // L764-767
                            WbBailRelay.Typhoon(w, x, y, a.radius ?? 6);
                            fired.Add("typhoon"); detail.Add($"台风气旋成型({RS(x)},{RS(y)})");
                            break;
                        case "acid_rain":                                       // L768-771
                            WbBailRelay.AcidRain(w, x, y, a.radius ?? 5);
                            fired.Add("acid_rain"); detail.Add($"酸雨云凝聚({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "locust":                                          // L772-775
                            WbBailRelay.Locust(w, x, y, a.radius ?? 5);
                            fired.Add("locust"); detail.Add($"蝗群蔽日({RS(x)},{RS(y)})");
                            break;
                        case "famine":                                          // L776-779
                            WbBailRelay.FamineCloud(w, x, y, a.radius ?? 6);
                            fired.Add("famine"); detail.Add($"饥荒之云漂来({RS(x)},{RS(y)})");
                            break;
                        case "ice_age":                                         // L780-783
                            WbBailRelay.IceAge(w, x, y, a.radius ?? 6);
                            fired.Add("ice_age"); detail.Add($"冰河寒潮降临({RS(x)},{RS(y)})");
                            break;
                        case "sinkhole":                                        // L784-787
                            WbBailRelay.Sinkhole(w, x, y, a.radius ?? 4);
                            fired.Add("sinkhole"); detail.Add($"天坑塌陷({RS(x)},{RS(y)})半径{(a.radius ?? 4).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "blackhole":                                       // L788-791
                            WbBailRelay.Blackhole(w, x, y, a.radius ?? 8);
                            fired.Add("blackhole"); detail.Add($"黑洞撕开时空({RS(x)},{RS(y)})");
                            break;
                        case "wrath":                                           // L792-795
                            WbBailRelay.WrathStorm(w, x, y, a.radius ?? 5);
                            fired.Add("wrath"); detail.Add($"神怒之云聚拢({RS(x)},{RS(y)})");
                            break;
                        case "curse":                                           // L796-799
                            WbBailRelay.CurseArea(w, x, y, a.radius ?? 5);
                            fired.Add("curse"); detail.Add($"诅咒之地({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "love":                                            // L800-803
                            WbBailRelay.LoveArea(w, x, y, a.radius ?? 5);
                            fired.Add("love"); detail.Add($"爱之甘霖({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "mutate":                                          // L804-807
                            WbBailRelay.MutateArea(w, x, y, a.radius ?? 5);
                            fired.Add("mutate"); detail.Add($"变异辐射({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "teleport":                                        // L808-811
                            WbBailRelay.TeleportArea(w, x, y, a.radius ?? 5);
                            fired.Add("teleport"); detail.Add($"空间折叠({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "rain_cloud":                                      // L812-815
                            WbBailRelay.RainCloud(w, x, y, a.radius ?? 5);
                            fired.Add("rain_cloud"); detail.Add($"雨云蔽空({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        // ---------------- v2：机制链 + 计数器 ----------------
                        case "mech":                                            // L817-825
                        {
                            WbAgentLaw t = laws.Find((l) => l.id == a.target);   // L818
                            if (t == null) { detail.Add($"目标机制 {a.target} 已不存在"); break; }   // L819
                            // disable 走 toggle：既改 enabled 又还原目标机制的 param 账本（可逆性同样适用于机制链）
                            bool ok = Toggle(a.target, a.action == "enable");   // L821
                            fired.Add("mech");
                            detail.Add(ok ? $"机制「{t.name}」被{(a.action == "enable" ? "唤醒" : "冻结（param 已还原）")}" : $"机制 {a.target} 操作失败");   // L823
                            break;
                        }
                        case "counter":                                         // L826-832
                        {
                            double prev = counters.TryGetValue(a.name, out double pv) ? pv : 0;   // L827
                            double next = a.op == "set" ? a.value : prev + a.value;   // L828
                            counters[a.name] = Math.Max(-1e9, Math.Min(1e9, next));   // L829
                            fired.Add("counter"); detail.Add($"计数器 {a.name} = {counters[a.name].ToString(CultureInfo.InvariantCulture)}（{(a.op == "set" ? "设定" : "累加")} {a.value.ToString(CultureInfo.InvariantCulture)}）");   // L830
                            break;
                        }
                        // ---------------- v5：六新神力 ----------------
                        case "nuke":                                            // L834-837
                            WbBailRelay.Nuke(w, x, y, a.power ?? 2);
                            fired.Add("nuke"); detail.Add($"核弹蘑菇云升起({RS(x)},{RS(y)})");
                            break;
                        case "plague":                                          // L838-841
                            WbBailRelay.PlagueArea(w, x, y, Math.Max(3, a.radius ?? 5));
                            fired.Add("plague"); detail.Add($"瘟疫蔓延({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "fire":                                            // L842-855
                        {
                            double rad = a.radius ?? 5;
                            int n = 0;
                            double r2 = rad * rad;
                            for (int yy = Math.Max(0, (int)(y - rad)); yy <= Math.Min(WbWorld.H - 1, (int)(y + rad)); yy++)   // L846
                            {
                                for (int xx = Math.Max(0, (int)(x - rad)); xx <= Math.Min(WbWorld.W - 1, (int)(x + rad)); xx++)   // L847
                                {
                                    if ((xx - x) * (xx - x) + (yy - y) * (yy - y) > r2) continue;   // L848
                                    WbBailRelay.IgniteE(w, yy * WbWorld.W + xx);   // L849（M-U28 可见性放宽 private→internal；ignite L1078 译件 1 掷/点燃）
                                    n++;
                                }
                            }
                            fired.Add("fire"); detail.Add($"天火点燃{n.ToString(CultureInfo.InvariantCulture)}格({RS(x)},{RS(y)})");
                            break;
                        }
                        case "boom":                                            // L856-859
                            WbBailRelay.Boom(w, x, y, Math.Max(2, a.radius ?? 5));
                            fired.Add("boom"); detail.Add($"爆破轰鸣({RS(x)},{RS(y)})半径{(a.radius ?? 5).ToString(CultureInfo.InvariantCulture)}");
                            break;
                        case "river":                                           // L860-863
                            // JS eng.carveRiver(x,y) → toolsTick case "river" L6434 同构（WbWorldgen 全级联 runtime 面）
                            WbWorldgen.CarveRiver(w, w.terrain, null, x, y, null, w.brush, true);
                            fired.Add("river"); detail.Add($"新河凿成({RS(x)},{RS(y)})");
                            break;
                        case "oasis":                                           // L864-867
                            WbBailRelay.CreateOasis(w, x, y);
                            fired.Add("oasis"); detail.Add($"绿洲涌泉({RS(x)},{RS(y)})");
                            break;
                    }
                }
            }
            finally
            {
                firing = wasFiring;                                             // L871
                statsCache = null;                                              // L872 神力已改变世界：统计快照作废
            }
            return fired.Count > 0 ? new WbLawFireReport { id = law.id, name = law.name, firedActions = fired, detail = detail } : null;   // L874
        }
    }
}
