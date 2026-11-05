// ============================================================
// WbArmory.cs — M-U30 武器铸造域（forge face）+ armoryTick 全件
// 蓝本: src/lib/game/engine.ts L8745-9315（涌现武器架构 v2——数据表/学说/防御/
//       选型/铸造/融合/神铸/锻造驱动）+ L12207-12264（armamentOf/armoryTick）+
//       L2023-2070（civAtWar/atWar——rel 映射语义）+ L15287-15291（serialize
//       weapons/dctr/ddef 行）+ L15605-15620（applySave 恢复面）
// 纪律: 机械翻译 + 行号锚；JS 对象 = JObject 行镜像（st.EmergentWeapons M-U6b 同形）；
//       JS Map 插入序 = emergentWeaponKeys 镜像（M-U28 教训 c）。
// 切片边界（挂账）: fireEmergent L9317-9396 / emergentPayload L9397-9436（WbBail 桩
//       L4042 维持——命中结算面 M-U31）/ wwCountKill L8699-8715 学说反馈支路
//       （killCredit 恒 null 死支路——WbCivSim.WwCountKill 桩注释同步）；WBB.touchMeta
//       （armoryTick 头 L12220）no-op（M-U28 槽 59 先例）；PAYLOAD_FX L8768 /
//       DYN_TINTS L8770 随发射面入账。
// 黄金: scripts/unity-migration/gen-armory.mjs → armory.json（9 场景 det 双跑字节级）
// ============================================================
namespace PixelWorldBox.Wb
{
    using System;
    using System.Collections.Generic;
    using System.Globalization;
    using System.Linq;
    using Newtonsoft.Json.Linq;

    /// <summary>武器铸造域（engine 涌现层）——静态域函数 + WbWorld 武器态消费（WbCivSim 同款协议）</summary>
    public static class WbArmory
    {
        // ============================================================
        // 数据表（蓝本 L8766/L8878-8910 逐行机械转写）
        // ============================================================

        /// <summary>装药组件（L8878-8886 —— 7 种：伤害类型/附带效应/破甲）</summary>
        public sealed class WcPayload
        {
            public string name; public int dtype; public double dmgMul, rMul, fire;
            public bool rad, terra; public double morale, pen;
        }

        /// <summary>投送组件（L8888-8894 —— 5 种：弹道特效/拦截难度/饱和）</summary>
        public sealed class WcDelivery
        {
            public string name; public string fx; public double speed, stealth, cadence, pen, sat;
        }

        /// <summary>制导组件（L8896-8902 —— 5 种：精度/抗诱饵）</summary>
        public sealed class WcGuide
        {
            public string name; public double acc, decoyRes, cadence, sat;
        }

        /// <summary>供能组件（L8904-8910 —— 5 种：威力放大/节奏/奇迹概率）</summary>
        public sealed class WcPower
        {
            public string name; public double dmgMul, cadence, wonder;
        }

        /// <summary>涌现代号表 L8878-8886（字段序 = 蓝本对象字面量序）</summary>
        public static readonly WcPayload[] WcPayloads =
        {
            new WcPayload { name = "穿甲", dtype = 0, dmgMul = 1.15, rMul = 0.85, fire = 0.05, rad = false, terra = false, morale = 6, pen = 0.6 },
            new WcPayload { name = "高爆", dtype = 1, dmgMul = 0.95, rMul = 1.25, fire = 0.25, rad = false, terra = false, morale = 10, pen = 0.1 },
            new WcPayload { name = "铝热", dtype = 1, dmgMul = 0.8, rMul = 1.0, fire = 0.85, rad = false, terra = false, morale = 8, pen = 0.15 },
            new WcPayload { name = "电脉", dtype = 2, dmgMul = 0.75, rMul = 1.1, fire = 0, rad = false, terra = false, morale = 24, pen = 0.45 },
            new WcPayload { name = "毒剂", dtype = 3, dmgMul = 0.7, rMul = 0.9, fire = 0, rad = true, terra = false, morale = 14, pen = 0.05 },
            new WcPayload { name = "聚变", dtype = 1, dmgMul = 1.5, rMul = 1.35, fire = 0.5, rad = true, terra = false, morale = 18, pen = 0.2 },
            new WcPayload { name = "反物", dtype = 4, dmgMul = 1.8, rMul = 1.45, fire = 0, rad = true, terra = true, morale = 26, pen = 0.55 },
        };

        /// <summary>投送表 L8888-8894</summary>
        public static readonly WcDelivery[] WcDeliveries =
        {
            new WcDelivery { name = "火炮", fx = "shell", speed = 0.5, stealth = 0, cadence = 1.3, pen = 0, sat = 0 },
            new WcDelivery { name = "火箭", fx = "drone", speed = 0.62, stealth = 0.15, cadence = 1.05, pen = 0, sat = 0.35 },
            new WcDelivery { name = "钻地", fx = "shell", speed = 0.8, stealth = 0.35, cadence = 0.75, pen = 0.25, sat = 0 },
            new WcDelivery { name = "滑翔", fx = "plasma", speed = 0.9, stealth = 0.55, cadence = 0.6, pen = 0.1, sat = 0.1 },
            new WcDelivery { name = "轨道", fx = "orbital", speed = 1.0, stealth = 0.7, cadence = 0.45, pen = 0.05, sat = 0 },
        };

        /// <summary>制导表 L8896-8902</summary>
        public static readonly WcGuide[] WcGuides =
        {
            new WcGuide { name = "哑弹", acc = 0.3, decoyRes = 0, cadence = 1.4, sat = 0 },
            new WcGuide { name = "惯导", acc = 0.55, decoyRes = 0.25, cadence = 1.0, sat = 0 },
            new WcGuide { name = "精导", acc = 0.78, decoyRes = 0.5, cadence = 0.75, sat = 0 },
            new WcGuide { name = "蜂群", acc = 0.68, decoyRes = 0.85, cadence = 0.9, sat = 0.3 },
            new WcGuide { name = "量子", acc = 0.95, decoyRes = 1.0, cadence = 0.5, sat = 0 },
        };

        /// <summary>供能表 L8904-8910</summary>
        public static readonly WcPower[] WcPowers =
        {
            new WcPower { name = "化学", dmgMul = 1.0, cadence = 1.0, wonder = 0 },
            new WcPower { name = "激光", dmgMul = 1.1, cadence = 1.15, wonder = 0.01 },
            new WcPower { name = "超导", dmgMul = 1.2, cadence = 1.3, wonder = 0.02 },
            new WcPower { name = "堆心", dmgMul = 1.35, cadence = 1.5, wonder = 0.03 },
            new WcPower { name = "奇点", dmgMul = 1.55, cadence = 1.75, wonder = 0.05 },
        };

        /// <summary>威名后缀 L8766（10 项——epi 抽奖池）</summary>
        public static readonly string[] WeapEpi = { "焚天", "裂地", "蚀海", "静默", "终焉", "湮灭", "穿云", "噬星", "惊雷", "破晓" };

        /// <summary>Mk 罗马数（L9101/L9185 字面量序）</summary>
        private static readonly string[] MkRomans = { "I", "II", "III", "IV", "V", "VI", "VII", "VIII" };

        // ============================================================
        // JS 语义助手（WbAgentLaws/WbSave2 同款副本——M-U6a 协议）
        // ============================================================

        private static bool JIsNum(JToken t, out double v)
        {
            v = 0;
            if (t == null) return false;
            if (t.Type == JTokenType.Integer) { v = (int)t; return true; }
            if (t.Type == JTokenType.Float) { v = (double)t; return true; }
            return false;
        }

        /// <summary>JS `x ?? d`（null/undefined → d；0 保留——≠ JNumOr 的 || 语义）</summary>
        private static double JNullish(JObject o, string key, double d)
        {
            JToken t = o[key];
            if (t == null || t.Type == JTokenType.Null) return d;
            return (double)t;
        }

        /// <summary>JS !x 真值门镜像（Boolean/数值/字符串——本域行 retired 恒 Boolean 或 absent）</summary>
        private static bool JTruthy(JToken t)
        {
            if (t == null || t.Type == JTokenType.Null) return false;
            if (t.Type == JTokenType.Boolean) return (bool)t;
            if (t.Type == JTokenType.Integer) return (int)t != 0;
            if (t.Type == JTokenType.Float) return (double)t != 0;
            if (t.Type == JTokenType.String) return t.ToString().Length > 0;
            return true;
        }

        /// <summary>JS `arr?.[i] ?? d`（q 向量元素）</summary>
        private static double JQNullish(JObject o, string key, int i, double d)
        {
            JToken t = o[key];
            if (t == null || t.Type == JTokenType.Null) return d;
            JToken e = t[i];
            if (e == null || e.Type == JTokenType.Null) return d;
            return (double)e;
        }

        /// <summary>JS number → string（模板字面量插值——shortest roundtrip 同构；|v|≥1e-4 值域避开指数形态，长尾 M-U28 DIVERGENCE-3 同册）</summary>
        private static string JsNum(double v) => v.ToString(CultureInfo.InvariantCulture);

        /// <summary>JS String(x).slice(0, n)——UTF-16 码元切片（WbAgentLaws.TrimSlice 同款）</summary>
        private static string TrimSlice(string s, int n)
        {
            if (s == null) s = "undefined";
            return s.Length <= n ? s : s.Substring(0, n);
        }

        // ============================================================
        // 武器表镜像助手（emergentWeapons + 插入序 keys 同步维护）
        // ============================================================

        /// <summary>Map.set 语义（已存 key 不动插入序——JS Map 同构）</summary>
        public static void WeaponSet(WbWorld w, int id, JObject row)
        {
            if (!w.emergentWeapons.ContainsKey(id)) w.emergentWeaponKeys.Add(id);
            w.emergentWeapons[id] = row;
        }

        /// <summary>Map.get 语义</summary>
        public static JObject WeaponGet(WbWorld w, int id)
            => w.emergentWeapons.TryGetValue(id, out JObject row) ? row : null;

        /// <summary>Map.set 语义（doctrines——已存 key 不动插入序）</summary>
        public static void DoctrineSet(WbWorld w, int id, WbWorld.WbDoctrine d)
        {
            if (!w.doctrines.ContainsKey(id)) w.doctrinesKeys.Add(id);
            w.doctrines[id] = d;
        }

        /// <summary>Map.set 语义（defenses）</summary>
        public static void DefenseSet(WbWorld w, int id, WbWorld.WbDefense d)
        {
            if (!w.defenses.ContainsKey(id)) w.defensesKeys.Add(id);
            w.defenses[id] = d;
        }

        /// <summary>[...values()] 插入序快照（forge 池/序列化行序消费）</summary>
        public static List<JObject> WeaponValues(WbWorld w)
        {
            var list = new List<JObject>(w.emergentWeaponKeys.Count);
            foreach (int k in w.emergentWeaponKeys)
                if (w.emergentWeapons.TryGetValue(k, out JObject row)) list.Add(row);
            return list;
        }

        // ============================================================
        // 战和关系（engine L2067-2070 atWar / L2023-2031 civAtWar —— rel 映射语义；
        // ≠ WbUnits 的 rust-core CVAL 表——civ 域战和走 engine rel）
        // ============================================================

        /// <summary>engine L2067-2070 atWar（v &lt; -20 即交战）</summary>
        public static bool AtWar(WbWorld w, int a, int b)
        {
            return w.rel.TryGetValue(WbWorld.PairKey(a, b), out double v) && v < -20;   // L2068-2069
        }

        /// <summary>engine L2023-2031 civAtWar</summary>
        public static bool CivAtWar(WbWorld w, int civId)
        {
            foreach (WbCiv o in w.civs)                                                  // L2024
            {
                if (o.alive && o.id != civId && AtWar(w, civId, o.id)) return true;      // L2025
            }
            return false;                                                                // L2027
        }

        // ============================================================
        // 学说/防御（L8913-8934）
        // ============================================================

        /// <summary>engine L8913-8921 doctrineOf——首访问懒注入随机初始流派（4 掷）</summary>
        public static WbWorld.WbDoctrine DoctrineOf(WbWorld w, int civId)
        {
            if (!w.doctrines.TryGetValue(civId, out WbWorld.WbDoctrine d) || d == null)  // L8914
            {
                d = new WbWorld.WbDoctrine                                               // L8916-8917
                {
                    precision = 0.14 + w.Rng() * 0.24,                                   // r() ×4（L8915）
                    saturation = 0.14 + w.Rng() * 0.24,
                    terror = 0.14 + w.Rng() * 0.24,
                    attrition = 0.14 + w.Rng() * 0.24,
                };
                DoctrineSet(w, civId, d);                                                // L8918
            }
            return d;                                                                    // L8920
        }

        /// <summary>engine L8923-8928 defenseOf——零起步懒注入（零掷）</summary>
        public static WbWorld.WbDefense DefenseOf(WbWorld w, int civId)
        {
            if (!w.defenses.TryGetValue(civId, out WbWorld.WbDefense d) || d == null)    // L8924
            {
                d = new WbWorld.WbDefense { point = 0, armor = 0, evade = 0 };           // L8924
                DefenseSet(w, civId, d);                                                 // L8924
            }
            return d;
        }

        /// <summary>engine L8930-8934 defenseCap——军备时代硬天花板</summary>
        public static double DefenseCap(WbWorld w, int civId)
        {
            WbCiv c = civId >= 0 && civId < w.civs.Count ? w.civs[civId] : null;         // L8931（this.civs[civId] 越界 undefined）
            int tier = c != null ? ArmamentOf(w, c) : 0;                                 // L8932
            return 18 + tier * 13;                                                       // L8933
        }

        // ============================================================
        // 组件选型（L8937-8983）
        // ============================================================

        /// <summary>对抗画像（L8989 threat 字面量 / forgeWeapon L9003-9013 均值聚合）</summary>
        public struct WbThreat
        {
            public double point, armor, evade;
            public WbThreat(double p, double a, double e) { point = p; armor = a; evade = e; }
        }

        /// <summary>engine L8937-8983 pickComponent——学说权重 × 对抗偏好 × 时代门槛加权抽奖（1 掷）</summary>
        public static int PickComponent(WbWorld w, int slot, WbWorld.WbDoctrine doc, WbThreat threat, int tier)
        {
            double[] wl;                                                                 // L8938
            if (slot == 0)                                                               // L8939
            {
                wl = new double[]                                                        // L8941-8949
                {
                    0.4 + doc.attrition + threat.armor / 55,                             // 穿甲
                    0.9,                                                                 // 高爆
                    0.45,                                                                // 铝热
                    0.4 + threat.armor / 80,                                             // 电脉
                    0.3 + doc.terror * 1.7,                                              // 毒剂
                    tier >= 6 ? 0.25 + doc.terror * 1.3 : 0,                             // 聚变（未来）
                    tier >= 6 ? 0.14 + doc.terror : 0,                                   // 反物（未来）
                };
            }
            else if (slot == 1)                                                          // L8950
            {
                wl = new double[]                                                        // L8952-8958
                {
                    0.8 + doc.attrition * 0.8,                                           // 火炮
                    0.6 + doc.saturation * 1.8,                                          // 火箭
                    0.35 + threat.point / 90 + doc.precision * 0.4,                      // 钻地
                    tier >= 5 ? 0.3 + threat.point / 70 : 0,                             // 滑翔（现代）
                    tier >= 6 ? 0.22 + threat.point / 55 : 0,                            // 轨道（未来）
                };
            }
            else if (slot == 2)                                                          // L8959
            {
                wl = new double[]                                                        // L8961-8967
                {
                    0.5 + doc.attrition * 1.2,                                           // 哑弹
                    0.9,                                                                 // 惯导
                    0.5 + doc.precision * 1.6,                                           // 精导
                    0.35 + threat.evade / 70 + doc.saturation * 0.5,                     // 蜂群
                    tier >= 6 ? 0.2 + doc.precision * 0.9 + threat.evade / 60 : 0,       // 量子
                };
            }
            else                                                                         // L8968
            {
                wl = new double[]                                                        // L8970-8976
                {
                    0.9,                                                                 // 化学
                    tier >= 5 ? 0.6 : 0,                                                 // 激光
                    tier >= 5 ? 0.45 : 0,                                                // 超导
                    tier >= 6 ? 0.3 : 0,                                                 // 堆心
                    tier >= 6 ? 0.18 : 0,                                                // 奇点
                };
            }
            double total = 0;                                                            // L8978 reduce
            foreach (double x in wl) total += x;
            double pick = w.Rng() * total;                                               // L8979（1 掷）
            for (int k = 0; k < wl.Length; k++)                                          // L8980-8982
            {
                pick -= wl[k];
                if (pick <= 0) return k;
            }
            return 0;                                                                    // L8983
        }

        // ============================================================
        // 铸造/融合/神铸（L8985-9257）—— 机械翻译逐行行号锚
        // ============================================================

        /// <summary>engine L8985-9118 forgeWeapon——铸造一件涌现武器（v2 架构化）：
        /// 学说偏置选型 + 血系组件继承突变 + q 品质向量遗传。fresh 10 掷/血系 8+突变槽掷。</summary>
        public static JObject ForgeWeapon(WbWorld w, WbCiv c, JObject parent)
        {
            if (w.emergentWeapons.Count >= 128) return null;                             // L8989（v4：上限 96→128）
            var active = new List<JObject>();                                            // L8990（[...values()].filter）
            foreach (var wr in WeaponValues(w))
                if (!JTruthy(wr["retired"]) && wr.Value<int>("civ") == c.id) active.Add(wr);
            if (active.Count >= 5) return null;                                          // L8990
            int tier = ArmamentOf(w, c);                                                 // L8991（4 火器 / 5 现代 / 6 未来）
            if (tier < 4) return null;                                                   // L8992
            // —— 铸造经费（Task 34 经济闭环）：代数越高迭代越贵，国库见底则军工停摆 ——
            int parentGen = parent != null ? (int)parent["gen"] : 0;                     // L8993（parent.gen * 4）
            double forgeCost = 12 + (parent != null ? parentGen * 4 : 6);                // L8993
            if ((c.gold ?? 0) < forgeCost) return null;                                  // L8994
            WbWorld.WbDoctrine doc = DoctrineOf(w, c.id);                                // L8995（首访 4 掷）
            // 敌国防御画像（对抗性选型的压力源）
            var foes = new List<WbCiv>();                                                // L8997
            foreach (var o in w.civs) if (o.alive && o.id != c.id && AtWar(w, c.id, o.id)) foes.Add(o);
            double tPoint = 0, tArmor = 0, tEvade = 0;                                   // L8999-9001
            if (foes.Count > 0)
            {
                foreach (var f in foes)
                {
                    WbWorld.WbDefense fd = DefenseOf(w, f.id);                           // L9001
                    tPoint += fd.point; tArmor += fd.armor; tEvade += fd.evade;
                }
                tPoint /= foes.Count; tArmor /= foes.Count; tEvade /= foes.Count;        // L9006-9008
            }
            var threat = new WbThreat(tPoint, tArmor, tEvade);                           // L9009
            int gen = parent != null ? parentGen + 1 : 1;                                // L9010
            // 四槽选型：血系继承（单槽突变换新） or 全新架构
            int pl, dl, gd, pw;                                                          // L9012-9015
            if (parent != null)
            {
                pl = (int)JNullish(parent, "pl", 1);                                     // L9016
                dl = (int)JNullish(parent, "dl", 0);                                     // L9017
                gd = (int)JNullish(parent, "gd", 1);                                     // L9018
                pw = (int)JNullish(parent, "pw", 0);                                     // L9019
                int mutSlot = (int)Math.Floor(w.Rng() * 4);                              // L9020（1 掷）
                if (mutSlot == 0) pl = PickComponent(w, 0, doc, threat, tier);           // L9021
                else if (mutSlot == 1) dl = PickComponent(w, 1, doc, threat, tier);      // L9022
                else if (mutSlot == 2) gd = PickComponent(w, 2, doc, threat, tier);      // L9023
                else pw = PickComponent(w, 3, doc, threat, tier);                        // L9024
            }
            else
            {
                pl = PickComponent(w, 0, doc, threat, tier);                             // L9026
                dl = PickComponent(w, 1, doc, threat, tier);                             // L9027
                gd = PickComponent(w, 2, doc, threat, tier);                             // L9028
                pw = PickComponent(w, 3, doc, threat, tier);                             // L9029
            }
            // q 品质向量（装药威力/投送速度/制导精度/供能效率）：遗传 ± 突变，或全新采样
            double q0, q1, q2, q3;                                                       // L9031-9039（clampQ + 遗传/采样）
            JArray parentQ = parent != null ? parent["q"] as JArray : null;
            if (parent != null && parentQ != null)
            {
                q0 = ClampQ(w, parentQ[0].Value<double>() * (0.96 + w.Rng() * 0.16), 1.4);
                q1 = ClampQ(w, parentQ[1].Value<double>() * (0.96 + w.Rng() * 0.16), 1.4);
                q2 = ClampQ(w, parentQ[2].Value<double>() * (0.96 + w.Rng() * 0.16), 1.4);
                q3 = ClampQ(w, parentQ[3].Value<double>() * (0.96 + w.Rng() * 0.16), 1.4);
            }
            else
            {
                q0 = ClampQ(w, 0.75 + w.Rng() * 0.55, 1.4);
                q1 = ClampQ(w, 0.75 + w.Rng() * 0.55, 1.4);
                q2 = ClampQ(w, 0.75 + w.Rng() * 0.55, 1.4);
                q3 = ClampQ(w, 0.75 + w.Rng() * 0.55, 1.4);
            }
            WcPayload P = WcPayloads[pl];                                                // L9040
            WcDelivery D = WcDeliveries[dl];                                             // L9041
            WcGuide G = WcGuides[gd];                                                    // L9042
            WcPower PW = WcPowers[pw];                                                   // L9043
            bool wonder = false;                                                         // L9044（!parent && 短路——parent 有则不掷）
            if (parent == null) wonder = w.Rng() < 0.02 + PW.wonder;
            // —— 代数收益递减 + 软上限（Task 34 失衡修复）——
            double dmgCap = 130 + tier * 14;                                             // L9047（火器 186 / 现代 200 / 未来 214）
            double dmg = Math.Min(dmgCap, (16 + 26 * q0) * P.dmgMul * PW.dmgMul * (1 + 0.3 * (tier - 4)) * (1 + 0.2 * (gen - 1)) * (wonder ? 2 : 1));   // L9050
            double radius = (1.2 + 0.9 * q1) * P.rMul + 0.12 * (gen - 1);                // L9051
            double fire = P.fire * Math.Min(1.1, q0);                                    // L9052
            bool rad = P.rad;                                                            // L9053
            bool terra = P.terra;                                                        // L9054
            double morale = P.morale * (0.85 + 0.3 * q2);                                // L9055
            if (parent != null)
            {
                // 血系迭代整体强化（增益随代数衰减）
                double parentDmg = parent.Value<double>("dmg");
                double parentRadius = parent.Value<double>("radius");
                double parentMorale = parent.Value<double>("morale");
                dmg = Math.Min(dmgCap, Math.Max(parentDmg * (1 + (0.1 + w.Rng() * 0.08) * Math.Pow(0.92, gen)), dmg * 0.85));   // L9059（1 掷）
                radius = Math.Max(parentRadius * 1.03, radius * 0.9);                    // L9060
                morale = Math.Min(35, Math.Max(parentMorale + 3, morale * 0.9));         // L9061
            }
            string mk = gen > 1 ? $" Mk.{MkRomans[Math.Min(7, gen - 1)]}" : "";          // L9062
            string epi = WeapEpi[(int)Math.Floor(w.Rng() * WeapEpi.Length)];             // L9063（1 掷）
            string name = $"{(wonder ? "神铸·" : "")}{P.name}·{D.name}·{G.name}{mk}·{epi}";   // L9064
            int id = w.weapSeq; w.weapSeq++;                                             // L9065（id: this.weapSeq++）
            var row = new JObject                                                        // L9065-9082（对象字面量序）
            {
                ["id"] = id,
                ["civ"] = c.id,
                ["name"] = name,
                ["gen"] = gen,
                ["dtype"] = P.dtype,
                ["delivery"] = dl,
                ["dmg"] = WbMath.JsRound(dmg * 10) / 10.0,                               // L9071（Math.round(dmg*10)/10）
                ["radius"] = WbMath.JsRound(Math.Min(6.5, radius) * 10) / 10.0,          // L9072
                ["fire"] = WbMath.JsRound(Math.Max(0, Math.Min(1, fire)) * 100) / 100.0, // L9073
                ["rad"] = rad,
                ["terra"] = terra,
                ["morale"] = (int)WbMath.JsRound(Math.Min(35, morale)),                  // L9074
                ["wonder"] = wonder,
                ["kills"] = 0,
                ["fired"] = 0,
                ["parent"] = parent != null ? (JToken)(int)parent["id"] : JToken.Parse("null"),   // L9076（parent?.id ?? null）
                ["bornYear"] = (int)Math.Floor(w.yearF),                                 // L9077
                ["retired"] = false,
                ["pl"] = pl,
                ["dl"] = dl,
                ["gd"] = gd,
                ["pw"] = pw,
                ["q"] = new JArray { q0, q1, q2, q3 },
                ["inter"] = 0,
            };
            WeaponSet(w, id, row);                                                       // L9083
            c.gold = Math.Max(0, (c.gold ?? 0) - forgeCost);                             // L9084（铸造落账）
            // v3：武器谱系入图谱（血系迭代/缴获仿制挂边到父设计节点）
            var meta = new Dictionary<string, object>                                    // L9087（meta 字面量）
            {
                ["civ"] = c.id, ["wid"] = id,
                ["dmg"] = (int)WbMath.JsRound(row.Value<double>("dmg")),
                ["radius"] = row.Value<double>("radius"),
                ["gen"] = gen,
            };
            string detail = parent != null
                ? $"第 {gen} 代血系迭代（{P.name}·{D.name}·{G.name}）"
                : $"全新铸造（{P.name}×{D.name}×{G.name}×{PW.name}）{(wonder ? " —— 奇迹武器" : "")}";
            string stat = $"威力 {JsNum(WbMath.JsRound(row.Value<double>("dmg")))}·半径 {JsNum(row.Value<double>("radius"))}";
            int wNode = WbCivSim.RecordEvo(w, "weapon", name, parent != null ? $"wp:{(int)parent["id"]}" : null, c.colorHex, detail, stat, meta);   // L9086-9087
            w.evoIndex[$"wp:{id}"] = wNode;                                              // L9088
            // 纪事：铸造/迭代/缴获仿制 三种叙事（v2 带架构叙事）
            if (parent != null && (int)parent["civ"] != c.id)
            {
                // L9091-9092：缴获仿制（get(parent.id)?.name ?? parent.name）
                string capturedName = parent["name"].ToString();
                JObject pr = WeaponGet(w, (int)parent["id"]);
                if (pr != null && pr["name"] != null && pr["name"].Type != JTokenType.Null) capturedName = pr["name"].ToString();
                w.AddEvent("emerge", $"「{c.name}」的军械师逆向缴获的「{capturedName}」，嫁接出己方架构——「{name}」（{P.name}弹体 + {D.name}投送）", c.colorHex);
            }
            else if (parent != null)
            {
                parent["retired"] = true;                                                // L9094（旧型退役——谱系保留）
                w.AddEvent("emerge", $"「{c.name}」依实战反馈将「{parent["name"]}」重构为第 {gen} 代——「{name}」（{P.name}·{D.name}·{G.name}，威力 {JsNum(WbMath.JsRound(row.Value<double>("dmg")))}）", c.colorHex);   // L9095
            }
            else if (wonder)
            {
                w.AddEvent("emerge", $"奇迹武器诞生！「{c.name}」的工坊铸出旷世之作——「{name}」（{P.name}装药 × {PW.name}供能，威力 {JsNum(WbMath.JsRound(row.Value<double>("dmg")))} / 半径 {JsNum(row.Value<double>("radius"))}）", c.colorHex);   // L9097
                w.Toast($"奇迹武器「{name}」铸成", "war");                                // L9098
            }
            else
            {
                string doctrineName = doc.terror > 0.4 ? "恐吓" : doc.saturation > 0.4 ? "饱和" : doc.precision > 0.4 ? "精确" : "消耗";   // L9100
                w.AddEvent("emerge", $"「{c.name}」以{doctrineName}学说铸造新武器——「{name}」（威力 {JsNum(WbMath.JsRound(row.Value<double>("dmg")))} / 半径 {JsNum(row.Value<double>("radius"))}{(rad ? " / 辐射" : "")}{(terra ? " / 湮灭地形" : "")}）", c.colorHex);   // L9100-9101
            }
            return row;                                                                  // L9102
        }

        /// <summary>clampQ 内联助手（L9032 fresh / L9139 fuse 上限 1.45 分参）</summary>
        private static double ClampQ(WbWorld w, double v, double hi)
            => Math.Max(0.6, Math.Min(hi, WbMath.JsRound(v * 1000) / 1000.0));

        /// <summary>engine L9122-9204 fuseWeapon——涌现武器融合（超级演化 v4）：
        /// 两件成熟设计嫁接——四槽各取其优、q 向量逐维取大再乘杂种优势（1 掷 epi）。</summary>
        public static JObject FuseWeapon(WbWorld w, WbCiv c, JObject wa, JObject wb)
        {
            if (w.emergentWeapons.Count >= 128) return null;                             // L9123
            if (wa == null || wb == null) return null;                                   // L9124 防御（JS undefined 访问 throw——gen 夹具恒实行）
            if ((int)wa["id"] == (int)wb["id"] || (int)wa["civ"] != c.id || (int)wb["civ"] != c.id) return null;   // L9124
            int tier = ArmamentOf(w, c);                                                 // L9125
            if (tier < 4) return null;                                                   // L9126
            // —— 融合经费：比迭代更昂贵（嫁接两套生产线的成本）——
            double fuseCost = 26 + Math.Max(wa.Value<int>("gen"), wb.Value<int>("gen")) * 5;   // L9128
            if ((c.gold ?? 0) < fuseCost) return null;                                   // L9129
            int gen = Math.Max(wa.Value<int>("gen"), wb.Value<int>("gen")) + 1;          // L9130
            // —— 四槽选型：按各槽位的性能贡献取优（装药看威力、投送看隐蔽、制导看精度、供能看放大）——
            int pl = JQNullish(wa, "q", 0, 1) * WcPayloads[(int)JNullish(wa, "pl", 1)].dmgMul >= JQNullish(wb, "q", 0, 1) * WcPayloads[(int)JNullish(wb, "pl", 1)].dmgMul ? (int)JNullish(wa, "pl", 1) : (int)JNullish(wb, "pl", 1);   // L9133
            int dl = WcDeliveries[(int)JNullish(wa, "dl", 0)].stealth >= WcDeliveries[(int)JNullish(wb, "dl", 0)].stealth ? (int)JNullish(wa, "dl", 0) : (int)JNullish(wb, "dl", 0);   // L9134
            int gd = WcGuides[(int)JNullish(wa, "gd", 1)].acc >= WcGuides[(int)JNullish(wb, "gd", 1)].acc ? (int)JNullish(wa, "gd", 1) : (int)JNullish(wb, "gd", 1);   // L9135
            int pw = WcPowers[(int)JNullish(wa, "pw", 0)].dmgMul >= WcPowers[(int)JNullish(wb, "pw", 0)].dmgMul ? (int)JNullish(wa, "pw", 0) : (int)JNullish(wb, "pw", 0);   // L9136
            // —— q 品质向量：逐维取大 × 1.05 杂种优势（上限 1.45）——
            double q0 = ClampQ(w, Math.Max(JQNullish(wa, "q", 0, 1), JQNullish(wb, "q", 0, 1)) * 1.05, 1.45);   // L9140
            double q1 = ClampQ(w, Math.Max(JQNullish(wa, "q", 1, 1), JQNullish(wb, "q", 1, 1)) * 1.05, 1.45);   // L9141
            double q2 = ClampQ(w, Math.Max(JQNullish(wa, "q", 2, 1), JQNullish(wb, "q", 2, 1)) * 1.05, 1.45);   // L9142
            double q3 = ClampQ(w, Math.Max(JQNullish(wa, "q", 3, 1), JQNullish(wb, "q", 3, 1)) * 1.05, 1.45);   // L9143
            WcPayload P = WcPayloads[pl];                                                // L9145
            WcDelivery D = WcDeliveries[dl];                                             // L9146
            WcGuide G = WcGuides[gd];                                                    // L9147
            WcPower PW = WcPowers[pw];                                                   // L9148
            // —— 数值推导：融合上限放宽 15%（唯一能突破常规软上限的途径）——
            double dmgCap = (130 + tier * 14) * 1.15;                                    // L9151
            double dmg = Math.Min(dmgCap, (18 + 30 * q0) * P.dmgMul * PW.dmgMul * (1 + 0.3 * (tier - 4)) * (1 + 0.22 * (gen - 1)));   // L9152
            double radius = Math.Min(7.2, (1.35 + 0.95 * q1) * P.rMul + 0.14 * (gen - 1));   // L9153
            double fire = P.fire * Math.Min(1.1, q0);                                    // L9154
            double morale = P.morale * (0.9 + 0.32 * q2);                                // L9155
            // 融合增益：对双亲的相对优势保底（杂种不应弱于任一亲代）
            dmg = Math.Min(dmgCap, Math.Max(dmg, Math.Max(wa.Value<double>("dmg"), wb.Value<double>("dmg")) * 1.06));   // L9158
            radius = Math.Max(radius, Math.Max(wa.Value<double>("radius"), wb.Value<double>("radius")) * 1.02);   // L9159
            int moraleI = (int)WbMath.JsRound(Math.Min(38, Math.Max(morale, Math.Max(wa.Value<double>("morale"), wb.Value<double>("morale")) + 2)));   // L9160
            string mk = gen > 1 ? $" Mk.{MkRomans[Math.Min(7, gen - 1)]}" : "";          // L9162
            string epi = WeapEpi[(int)Math.Floor(w.Rng() * WeapEpi.Length)];             // L9163（1 掷）
            string name = $"融铸·{P.name}·{D.name}·{G.name}{mk}·{epi}";                  // L9164
            int id = w.weapSeq; w.weapSeq++;                                             // L9165（id: this.weapSeq++）
            var row = new JObject                                                        // L9165-9181
            {
                ["id"] = id,
                ["civ"] = c.id,
                ["name"] = name,
                ["gen"] = gen,
                ["dtype"] = P.dtype,
                ["delivery"] = dl,
                ["dmg"] = WbMath.JsRound(dmg * 10) / 10.0,
                ["radius"] = WbMath.JsRound(radius * 10) / 10.0,
                ["fire"] = WbMath.JsRound(Math.Max(0, Math.Min(1, fire)) * 100) / 100.0,
                ["rad"] = P.rad,
                ["terra"] = P.terra,
                ["morale"] = moraleI,
                ["wonder"] = false,
                ["kills"] = 0,
                ["fired"] = 0,
                ["parent"] = (int)wa["id"],                                              // L9178（parent: wa.id）
                ["parent2"] = (int)wb["id"],                                            // L9179（parent2: wb.id）
                ["bornYear"] = (int)Math.Floor(w.yearF),
                ["retired"] = false,
                ["pl"] = pl,
                ["dl"] = dl,
                ["gd"] = gd,
                ["pw"] = pw,
                ["q"] = new JArray { q0, q1, q2, q3 },
                ["inter"] = 0,
            };
            WeaponSet(w, id, row);                                                       // L9182
            c.gold = Math.Max(0, (c.gold ?? 0) - fuseCost);                              // L9183
            // 双亲退役（谱系保留——图谱上形成两条父边汇入融合节点）
            wa["retired"] = true;                                                        // L9185
            wb["retired"] = true;                                                        // L9186
            // —— 图谱：融合节点挂到主父（威力更高的那件），副父记入 meta ——
            JObject mainParent = wa.Value<double>("dmg") >= wb.Value<double>("dmg") ? wa : wb;   // L9189
            JObject subParent = ReferenceEquals(mainParent, wa) ? wb : wa;               // L9190（mainParent === wa ? wb : wa）
            var meta = new Dictionary<string, object>
            {
                ["civ"] = c.id, ["wid"] = id,
                ["dmg"] = (int)WbMath.JsRound(row.Value<double>("dmg")),
                ["radius"] = row.Value<double>("radius"),
                ["gen"] = gen,
                ["parent2"] = (int)subParent["id"],
            };
            string detail = $"双血系融合：「{wa["name"]}」×「{wb["name"]}」嫁接（{P.name}·{D.name}·{G.name}·{PW.name}）—— 四槽取优 + 杂种优势";
            string stat = $"威力 {JsNum(WbMath.JsRound(row.Value<double>("dmg")))}·半径 {JsNum(row.Value<double>("radius"))}";
            int wNode = WbCivSim.RecordEvo(w, "weapon", name, $"wp:{(int)mainParent["id"]}", c.colorHex, detail, stat, meta);   // L9189-9190
            w.evoIndex[$"wp:{id}"] = wNode;                                              // L9191
            w.AddEvent("emerge", $"军械史的奇点——「{c.name}」的工坊将「{wa["name"]}」与「{wb["name"]}」两套血系嫁接，铸出融合设计「{name}」（威力 {JsNum(WbMath.JsRound(row.Value<double>("dmg")))} / 半径 {JsNum(row.Value<double>("radius"))}{(P.rad ? " / 辐射" : "")}）", c.colorHex);   // L9193
            w.Toast($"融合武器「{name}」铸成", "war");                                    // L9194
            return row;                                                                  // L9195
        }

        /// <summary>engine L9206-9257 forgeDivineWeapon——神谕·神铸武器（forge_divine_weapon 工具真身）：
        /// 绕过时代/经费/活跃上限的神力铸造——wonder 奇迹标记 + 可选组件钦定 + 威力倍率。</summary>
        public static JObject ForgeDivineWeapon(WbWorld w, int civId, JObject opts)
        {
            WbCiv c = civId >= 0 && civId < w.civs.Count ? w.civs[civId] : null;         // L9207（this.civs[civId]）
            if (c == null || !c.alive) return null;                                      // L9207（!c?.alive）
            if (w.emergentWeapons.Count >= 128) return null;                             // L9208
            int tier = Math.Max(4, ArmamentOf(w, c));                                    // L9209
            WbWorld.WbDoctrine doc = DoctrineOf(w, c.id);                                // L9210（首访 4 掷）
            // cl = (v, hi) => (v == null || !Number.isFinite(v) ? -1 : Math.max(0, Math.min(hi, Math.round(v))))——L9211
            double Cl(string key, double hi)
            {
                if (!JIsNum(opts[key], out double v)) return -1;
                return Math.Max(0, Math.Min(hi, WbMath.JsRound(v)));
            }
            double zero = 0;
            int pl = Cl("pl", WcPayloads.Length - 1) >= 0 ? (int)Cl("pl", WcPayloads.Length - 1) : PickComponent(w, 0, doc, new WbThreat(zero, zero, zero), tier);   // L9212
            int dl = Cl("dl", WcDeliveries.Length - 1) >= 0 ? (int)Cl("dl", WcDeliveries.Length - 1) : PickComponent(w, 1, doc, new WbThreat(zero, zero, zero), tier);   // L9213
            int gd = Cl("gd", WcGuides.Length - 1) >= 0 ? (int)Cl("gd", WcGuides.Length - 1) : PickComponent(w, 2, doc, new WbThreat(zero, zero, zero), tier);   // L9214
            double pwRaw = Cl("pw", WcPowers.Length - 1);                                // L9215
            int pw = pwRaw >= 0 ? (int)pwRaw : Math.Min(WcPowers.Length - 1, tier >= 6 ? 4 : tier == 5 ? 3 : 2);   // L9216
            double boost = Math.Max(0.5, Math.Min(3, JNullish(opts, "boost", 1.6)));     // L9217
            WcPayload P = WcPayloads[pl];                                                // L9218
            WcDelivery D = WcDeliveries[dl];                                             // L9219
            WcGuide G = WcGuides[gd];                                                    // L9220
            WcPower PW = WcPowers[pw];                                                   // L9221
            double q0 = 1.25, q1 = 1.2, q2 = 1.25, q3 = 1.2;                             // L9222
            double dmgCap = (130 + tier * 14) * 1.3 * boost;                             // L9223（神铸上限：常规 ×1.3 × 钦定倍率）
            double dmg = Math.Min(dmgCap, (20 + 32 * q0) * P.dmgMul * PW.dmgMul * (1 + 0.3 * (tier - 4)) * boost);   // L9224
            double radius = Math.Min(7.5, (1.4 + 1.0 * q1) * P.rMul * (1 + boost * 0.08));   // L9225
            string nm = opts["name"] == null || opts["name"].Type == JTokenType.Null ? "" : opts["name"].ToString();   // L9226（(opts.name ?? '').trim()）
            nm = nm.Trim();
            if (nm == "") nm = $"神铸·{P.name}·{D.name}·{G.name}·天启";
            string name = TrimSlice(nm, 30);                                             // L9226（.slice(0, 30)——UTF-16 码元）
            int id = w.weapSeq; w.weapSeq++;                                             // L9227
            var row = new JObject                                                        // L9227-9242
            {
                ["id"] = id,
                ["civ"] = c.id,
                ["name"] = name,
                ["gen"] = 1,
                ["dtype"] = P.dtype,
                ["delivery"] = dl,
                ["dmg"] = WbMath.JsRound(dmg * 10) / 10.0,
                ["radius"] = WbMath.JsRound(radius * 10) / 10.0,
                ["fire"] = WbMath.JsRound(Math.Max(0, Math.Min(1, P.fire)) * 100) / 100.0,
                ["rad"] = P.rad,
                ["terra"] = P.terra,
                ["morale"] = (int)WbMath.JsRound(Math.Min(40, P.morale * 1.3)),
                ["wonder"] = true,
                ["kills"] = 0,
                ["fired"] = 0,
                ["parent"] = JToken.Parse("null"),
                ["bornYear"] = (int)Math.Floor(w.yearF),
                ["retired"] = false,
                ["pl"] = pl,
                ["dl"] = dl,
                ["gd"] = gd,
                ["pw"] = pw,
                ["q"] = new JArray { q0, q1, q2, q3 },
                ["inter"] = 0,
            };
            WeaponSet(w, id, row);                                                       // L9243
            var meta = new Dictionary<string, object>
            {
                ["civ"] = c.id, ["wid"] = id,
                ["dmg"] = (int)WbMath.JsRound(row.Value<double>("dmg")),
                ["radius"] = row.Value<double>("radius"),
                ["gen"] = 1,
                ["divine"] = 1,
            };
            string detail = $"神谕亲铸（{P.name}×{D.name}×{G.name}×{PW.name}，威力倍率 {boost.ToString("F2", CultureInfo.InvariantCulture)}）—— 神力不受物理学与预算约束";   // L9245（boost.toFixed(2)）
            string stat = $"威力 {JsNum(WbMath.JsRound(row.Value<double>("dmg")))}·半径 {JsNum(row.Value<double>("radius"))}";
            int wNode = WbCivSim.RecordEvo(w, "weapon", name, null, c.colorHex, detail, stat, meta);   // L9244-9245
            w.evoIndex[$"wp:{id}"] = wNode;                                              // L9246
            w.AddEvent("emerge", $"神谕亲铸——「{c.name}」的武库中降下天启兵器「{name}」（{P.name}装药 × {PW.name}供能，威力 {JsNum(WbMath.JsRound(row.Value<double>("dmg")))} / 半径 {JsNum(row.Value<double>("radius"))}{(P.rad ? " / 辐射" : "")}{(P.terra ? " / 湮灭地形" : "")}）", c.colorHex);   // L9247
            w.Toast($"神铸武器「{name}」降临", "war");                                    // L9248
            return row;                                                                  // L9249
        }

        // ============================================================
        // 锻造驱动（L9259-9315）
        // ============================================================

        /// <summary>engine L9259-9315 emergentForgeTick——涌现锻造驱动（armoryTick 尾部）：
        /// 交战国随机铸造 + 战绩迭代 + 缴获仿制 + 融合铸造 + 和平期防御荒废。</summary>
        public static void EmergentForgeTick(WbWorld w)
        {
            var atWarList = new List<WbCiv>();                                           // L9260
            foreach (var c in w.civs)
                if (c.alive && c.pop >= 6 && CivAtWar(w, c.id)) atWarList.Add(c);
            foreach (var c in atWarList)                                                 // L9261
            {
                // —— 融合铸造（超级演化 v4）：两件成熟设计（fired ≥ 5）→ 18% 概率嫁接出融合体 ——
                var fusePool = new List<JObject>();                                      // L9263
                foreach (var row in WeaponValues(w))
                    if (!JTruthy(row["retired"]) && row.Value<int>("civ") == c.id && JNullish(row, "fired", 0) >= 5) fusePool.Add(row);
                if (fusePool.Count >= 2 && w.Rng() < 0.18)                               // L9264（短路：pool<2 零掷）
                {
                    int i = (int)Math.Floor(w.Rng() * fusePool.Count);                   // L9265
                    int j = (int)Math.Floor(w.Rng() * (fusePool.Count - 1));             // L9266
                    if (j >= i) j++;                                                     // L9267
                    if (FuseWeapon(w, c, fusePool[i], fusePool[j]) != null) continue;    // L9268
                }
                // —— 战绩反馈迭代：发射 ≥ 6 且杀敌 ≥ 12 的成熟设计 → 55% 概率迭代下一代 ——
                var mature = new List<JObject>();                                        // L9271
                foreach (var row in WeaponValues(w))
                    if (!JTruthy(row["retired"]) && row.Value<int>("civ") == c.id && JNullish(row, "fired", 0) >= 6 && JNullish(row, "kills", 0) >= 12) mature.Add(row);
                if (mature.Count > 0 && w.Rng() < 0.55)                                  // L9272（短路）
                {
                    ForgeWeapon(w, c, mature[(int)Math.Floor(w.Rng() * mature.Count)]);  // L9273
                    continue;                                                            // L9274
                }
                // —— 缴获仿制：敌国在役高杀武器（kills ≥ 15）→ 25% 概率被本国逆向 ——
                var foes = new List<WbCiv>();                                            // L9276
                foreach (var o in w.civs) if (o.alive && o.id != c.id && AtWar(w, c.id, o.id)) foes.Add(o);
                if (foes.Count > 0 && w.Rng() < 0.25)                                    // L9277（短路）
                {
                    var prized = new List<JObject>();                                    // L9278
                    foreach (var row in WeaponValues(w))
                    {
                        if (!JTruthy(row["retired"]) && row.Value<double>("kills") >= 15)
                        {
                            bool foeOwns = false;
                            foreach (var f in foes) if (f.id == row.Value<int>("civ")) { foeOwns = true; break; }
                            if (foeOwns) prized.Add(row);
                        }
                    }
                    if (prized.Count > 0 && w.Rng() < 0.5)                               // L9279（短路）
                    {
                        ForgeWeapon(w, c, prized[(int)Math.Floor(w.Rng() * prized.Count)]);   // L9280
                        continue;                                                        // L9281
                    }
                }
                // —— 全新铸造：交战国每轮（240 tick ≈ 6 年）小概率开新谱系；世界大战期翻倍 ——
                double p = w.worldWar.phase == "running" ? 0.24 : 0.1;                   // L9284
                if (w.Rng() < p) ForgeWeapon(w, c, null);                                // L9285
            }
            // —— 对抗演化松弛：和平期防御荒废（无威胁则军备生锈），学说缓慢熵回均匀 ——
            foreach (var c in w.civs)                                                    // L9289
            {
                if (!c.alive) continue;                                                  // L9290
                bool inWar = false;                                                      // L9291
                foreach (var x in atWarList) if (x.id == c.id) { inWar = true; break; }
                if (inWar) continue;                                                     // L9292
                if (w.defenses.TryGetValue(c.id, out WbWorld.WbDefense def) && def != null)   // L9293（get——非懒注入）
                {
                    if (def.point > 0 || def.armor > 0 || def.evade > 0)                 // L9294
                    {
                        def.point *= 0.992;                                              // L9295
                        def.armor *= 0.992;                                              // L9296
                        def.evade *= 0.992;                                              // L9297
                        if (def.point < 0.05) def.point = 0;                             // L9298
                        if (def.armor < 0.05) def.armor = 0;                             // L9299
                        if (def.evade < 0.05) def.evade = 0;                             // L9300
                    }
                }
                if (w.doctrines.TryGetValue(c.id, out WbWorld.WbDoctrine doc) && doc != null)   // L9302（get——非懒注入零掷）
                {
                    doc.precision += (0.25 - doc.precision) * 0.01;                      // L9304
                    doc.saturation += (0.25 - doc.saturation) * 0.01;                    // L9305
                    doc.terror += (0.25 - doc.terror) * 0.01;                            // L9306
                    doc.attrition += (0.25 - doc.attrition) * 0.01;                      // L9307
                }
            }
        }

        // ============================================================
        // 工坊（L12207-12264）
        // ============================================================

        /// <summary>engine L12207-12216 armamentOf——科技时代档位（0-6）</summary>
        public static int ArmamentOf(WbWorld w, WbCiv civ)
        {
            List<string> t = civ.techs ?? new List<string>();                            // L12208（?? []）
            if (t.Contains("plasma") || t.Contains("antimatter") || t.Contains("drones") || t.Contains("lasers") || t.Contains("robotics") || t.Contains("orbital")) return 6;   // L12209
            if (t.Contains("explosives")) return 5;                                      // L12210
            if (t.Contains("gunpowder")) return 4;                                       // L12211
            if (t.Contains("steel")) return 3;                                           // L12212
            if (t.Contains("iron")) return 2;                                            // L12213
            if (t.Contains("bronze")) return 1;                                          // L12214
            return 0;                                                                    // L12215
        }

        /// <summary>engine L12219-12264 armoryTick——军备工坊（每 240 tick）：国库出钱武装无武器国民
        /// + 尾部涌现武器锻造驱动。头部 WBB.touchMeta（L12220）未译 no-op（M-U28 槽 59 先例——
        /// wbspatial 脏标记纯簿记零 rng 零语义）。</summary>
        public static void ArmoryTick(WbWorld w)
        {
            // WBB.touchMeta()（L12220）——未译域 no-op（wbspatial 行级脏标记——零 rng 零世界态）
            string[] WEAPON_BY_TIER = { "wood_club", "sword1", "sword2", "sword3", "musket", "rifle", "laser_rifle" };   // L12221
            string[] ARMOR_BY_TIER = { "", "armor1", "armor1", "armor2", "armor2", "iron_plate", "energy_shield" };       // L12222
            foreach (var civ in w.civs)                                                  // L12223
            {
                if (!civ.alive || civ.pop < 6) continue;                                 // L12224
                int tier = ArmamentOf(w, civ);                                           // L12225
                if (tier < 1) continue;                                                  // L12226（木石时代无武备工业）
                double gold = civ.gold ?? 0;                                             // L12227
                if (gold < 2) continue;                                                  // L12228（国库见底无力造械）
                // —— 兑现率随军备档位提升（Task 34 去虚务实）——
                int quota = 2 + (int)Math.Floor(tier * 0.9);                             // L12234（tier6 → 7 人/轮）
                double budget = 4 + tier * 1.5;                                          // L12235（tier6 → 13 金/轮）
                int armed = 0;                                                           // L12236
                double spent = 0;
                foreach (var u in w.units)                                               // L12237
                {
                    if (armed >= quota || spent >= budget) break;                        // L12238（每国每轮产量与预算双封顶）
                    if (u.dead != 0 || u.civ != civ.id || u.boat != 0) continue;         // L12239
                    if (u.wep == null)                                                   // L12240（!u.wep——wep object null = 无装备）
                    {
                        string key = WEAPON_BY_TIER[tier];                               // L12241
                        if (WbBailRelay.ItemDefs.TryGetValue(key, out var def))          // L12242-12243（ITEM_DEFS[key]）
                        {
                            u.wep = key;                                                 // L12244
                            if (def.dmg != 0) u.dmg += def.dmg;                          // L12245（if (def.dmg) 真值门）
                            if (def.hp != 0)                                             // L12246
                            {
                                u.maxHp += def.hp;
                                u.hp = Math.Min(u.maxHp, u.hp + def.hp);
                            }
                            spent += 2;                                                  // L12247
                            armed++;
                            if (w.Rng() < 0.3) w.Fx("hammer", u.x, u.y, 12);             // L12248（1 掷 + 命中 fx 内 2 掷）
                        }
                    }
                    else if (u.armS == null && tier >= 2 && (u.jobC == 1 || u.jobC == 2))   // L12250（!u.arm——armS object；u.job 1/2 军职）
                    {
                        string key = ARMOR_BY_TIER[tier];                                // L12251
                        if (WbBailRelay.ItemDefs.TryGetValue(key, out var def))          // L12252
                        {
                            u.armS = key;                                                // L12254
                            if (def.hp != 0)                                             // L12255
                            {
                                u.maxHp += def.hp;
                                u.hp = Math.Min(u.maxHp, u.hp + def.hp);
                            }
                            spent += 2;                                                  // L12256
                            armed++;
                        }
                    }
                }
                if (spent > 0) civ.gold = Math.Max(0, gold - spent);                     // L12261
            }
            // —— 涌现武器锻造驱动（每 240 tick：交战国铸造/迭代/缴获仿制） ——
            EmergentForgeTick(w);                                                        // L12263
        }

        // ============================================================
        // 发射面（M-U31：fireEmergent L9317-9400 + emergentPayload L9403-9442
        //   + wwCountKill 反馈支路 WbCivSim 解桩）
        // ============================================================

        /// <summary>装药弹道视觉签名色 L8735（v3：动能白/高爆橙/铝热红/电脉青/生化绿/聚变金/反物质紫）</summary>
        public static readonly string[] PayloadFx =
        {
            "#e8e2d5", "#ff9b2d", "#ff5f3d", "#7df9ff", "#8fd66f", "#ffd93d", "#c98fff",
        };

        /// <summary>动态物种标记色板 L8737（头顶 1px 突变点——发射面随件入账）</summary>
        public static readonly string[] DynTints =
        {
            "#ff5fd2", "#5fe8ff", "#c9ff5f", "#ff9e5f", "#b45fff", "#7df9ff", "#ffb35f", "#a0ff8f",
        };

        /// <summary>engine fireEmergent L9317-9400 —— 发射一件涌现武器（v2 架构化）：
        /// 点防拦截判定 → 制导散射 → 装甲减伤 → 弹道特效；每一次交手都在改写双方的学说与防御。
        /// 掷序：foes 选 1 → army 门 0.4（有敌军团时）→ army 选（门命中时）→ building 选（回退时）
        ///   → 拦截 1 → missA 1 → fire 纵火 1 → fx 内 seed/dir 2（M-U30 教训 a：fx 掷数预算必计 2）。
        /// 整数计数写入 (int) 保型（JSON Integer——M-U30 教训 f 同族：kills/fired/inter 递增禁 Float 化）。</summary>
        public static void FireEmergent(WbWorld w, WbCiv c, JObject wep)
        {
            var foes = new List<WbCiv>();                                                                    // L9318
            foreach (var o in w.civs)
                if (o.alive && o.id != c.id && AtWar(w, c.id, o.id)) foes.Add(o);
            if (foes.Count == 0) return;                                                                     // L9319
            var foe = foes[(int)Math.Floor(w.Rng() * foes.Count)];                                           // L9320（foes 选掷——无条件）
            // 目标选择器：优先敌军团（nearer 高价值）→ 首都 → 随机建筑
            double tx = -1, ty = -1;                                                                         // L9322-9323
            var foeArmies = new List<WbArmy>();                                                              // L9324
            foreach (var a in w.armies) if (a.civ == foe.id) foeArmies.Add(a);
            if (foeArmies.Count > 0 && w.Rng() < 0.4)                                                        // L9325（army 门掷——短路：无军团零掷）
            {
                var a = foeArmies[(int)Math.Floor(w.Rng() * foeArmies.Count)];                               // L9326（army 选掷）
                WbU m = a.members.Count > 0 && w.unitById.TryGetValue(a.members[0], out var mm) ? mm : null;  // L9327（members[0] != null ? unitById.get : null）
                if (m != null && m.dead == 0) { tx = m.x; ty = m.y; }                                         // L9328（m && !m.dead）
            }
            if (tx < 0 && foe.capital >= 0) { tx = WbWorld.TileX(foe.capital) + 0.5; ty = WbWorld.TileY(foe.capital) + 0.5; }   // L9330
            if (tx < 0)                                                                                      // L9331
            {
                var fb = new List<WbBuilding>();                                                             // L9322
                foreach (var b in w.buildings) if (b.civ == foe.id) fb.Add(b);
                if (fb.Count > 0) { var b = fb[(int)Math.Floor(w.Rng() * fb.Count)]; tx = b.x + 0.5; ty = b.y + 0.5; }   // L9333（building 选掷）
            }
            if (tx < 0) return;                                                                              // L9335（无任何目标）
            double sx = WbCivSim.CivCenterX(w, c);                                                           // L9336
            double sy = WbCivSim.CivCenterY(w, c);                                                           // L9337
            var P = WcPayloads[(int)JNullish(wep, "pl", 1)];                                                 // L9338
            var D = WcDeliveries[(int)JNullish(wep, "dl", 0)];                                               // L9339
            var G = WcGuides[(int)JNullish(wep, "gd", 1)];                                                   // L9340
            double q1 = JQNullish(wep, "q", 1, 1), q2 = JQNullish(wep, "q", 2, 1);                          // L9341（q ?? [1,1,1,1] 槽位消费）
            var doc = DoctrineOf(w, c.id);                                                                    // L9342
            var def = DefenseOf(w, foe.id);                                                                   // L9343
            double defCap = DefenseCap(w, foe.id);                                                            // L9344
            wep["fired"] = (int)JNullish(wep, "fired", 0) + 1;                                                // L9345（w.fired++ 整型保型）
            // —— 拦截判定：点防 × (1-投送速度) × (1-饱和压制) ——
            double speed = D.speed * q1;                                                                      // L9347
            double sat = Math.Min(0.75, D.sat + G.sat);                                                      // L9348
            double pInt = (def.point / 100) * (1 - speed * 0.75) * (1 - sat);                                 // L9349（高速 speed>4/3 → 负值恒突防——蓝本语义）
            if (w.Rng() < pInt)                                                                              // L9350（拦截掷）
            {
                // 中段拦截：弹道中点炸成烟花，无伤害
                double mx = (sx + tx) / 2, my = (sy + ty) / 2;                                                 // L9352-9353
                w.Fx("explosion", mx, my, 16, optR: 1.8);                                                     // L9354（2 掷 seed/dir）
                w.Fx("spark", mx, my, 10);                                                                    // L9355（2 掷）
                wep["inter"] = (int)JNullish(wep, "inter", 0) + 1;                                             // L9356（整型保型）
                // 反馈回路：守方点防强化 + 攻方学说转向饱和/隐身投送 + 投送品质被否证
                def.point = Math.Min(defCap, def.point + 1.5);                                                 // L9358
                doc.saturation = Math.Min(0.95, doc.saturation + 0.025);                                      // L9359
                doc.precision = Math.Max(0.05, doc.precision - 0.012);                                        // L9360
                var qArr = wep["q"] as JArray;                                                                // L9361（if (w.q) w.q[1] = max(0.6, ·-0.02)）
                if (qArr != null) qArr[1] = Math.Max(0.6, qArr[1].Value<double>() - 0.02);
                int interNow = (int)JNullish(wep, "inter", 0);                                                 // L9362（inter===1 || %5===0 播报门）
                if (interNow == 1 || interNow % 5 == 0)
                    w.AddEvent("superweapon", $"「{foe.name}」的点防御网在半途撕碎了「{wep.Value<string>("name")}」——第 {interNow} 次拦截成功", foe.colorHex, mx, my);   // L9363
                if (w.worldWar.phase == "running" && w.worldWar.belligerents.Contains(c.id)) w.worldWar.emerged++;   // L9365
                return;                                                                                       // L9366（拦截后 return——无散射/纵火掷）
            }
            // —— 制导散射：有效精度 vs 疏散诱饵（诱饵抵抗高的制导不吃疏散）——
            double effAcc = G.acc * q2 * (1 - Math.Min(0.55, (def.evade / 100) * (1 - G.decoyRes)));   // L9369
            double missR = (1 - effAcc) * (3.5 + wep.Value<double>("radius") * 1.4);                          // L9370
            double missA = w.Rng() * Math.PI * 2;                                                             // L9371（missA 掷）
            double ax = tx + WbMath.FdCos(missA) * missR;                                                     // L9372（FdCos 位级）
            double ay = ty + WbMath.FdSin(missA) * missR;                                                     // L9373（FdSin 位级）
            // —— 装甲减伤：破甲能力抵消装甲（穿甲/钻地/电脉天生克制重甲）——
            double pen = Math.Min(0.85, P.pen + D.pen);                                                       // L9375
            double armorMit = Math.Max(0.35, 1 - (def.armor / 100) * (1 - pen));                              // L9376
            double dmgOut = wep.Value<double>("dmg") * armorMit;                                              // L9377
            double radiusOut = wep.Value<double>("radius") * (0.72 + 0.28 * armorMit);                         // L9378
            double dist = WbMath.FdHypot(ax - sx, ay - sy);                                                   // L9379
            double ttl = Math.Max(30, Math.Min(140, WbMath.JsRound(dist * 1.3)));                             // L9380（JsRound 位级——Math.round half-up）
            int fireVal = w.Rng() < wep.Value<double>("fire") ? 1 : 0;                                        // L9387（fire 纵火掷——JS opts 字面量求值先于 fx 调用）
            var fx = w.Fx(D.fx, ax, ay, ttl, optR: radiusOut, optColorHex: PayloadFx[Math.Max(0, Math.Min(6, (int)JNullish(wep, "pl", 1)))], optX0: sx, optY0: sy, optDmg: dmgOut);   // L9381-9390（fx 2 掷；col = PAYLOAD_FX[钳 0-6]——v3 装药专属弹道色）
            fx.src = c.id;                                                                                    // opts.src（后赋——WbFx 字段段）
            fx.fire = fireVal;                                                                               // opts.fire（0/1）
            fx.wid = wep.Value<int>("id");                                                                    // opts.wid（命中结算 killCredit 归属 + emergentPayload 门）
            if (w.worldWar.phase == "running" && w.worldWar.belligerents.Contains(c.id)) w.worldWar.emerged++;   // L9391
            // —— 挨打反馈：守方防御按攻击剖面成长（点防小涨/装甲大涨/疏散中涨）——
            def.point = Math.Min(defCap, def.point + 0.5);                                                     // L9393
            def.armor = Math.Min(defCap, def.armor + 1.6 * (1 - pen * 0.5));                                   // L9394
            def.evade = Math.Min(defCap, def.evade + 1.1);                                                     // L9395
            // 首射/奇迹武器入纪事（常规发射由命中结算播报，防刷屏）
            int firedNow = (int)JNullish(wep, "fired", 0);                                                     // L9397
            if (firedNow == 1 || JTruthy(wep["wonder"]))
                w.AddEvent("emerge", $"「{c.name}」的涌现武器「{wep.Value<string>("name")}」首次开火——{(effAcc > 0.7 ? "制导锁定" : "弹道解算")}完毕，目标：「{foe.name}」", c.colorHex, ax, ay);   // L9398
        }

        /// <summary>engine emergentPayload L9403-9442 —— 涌现武器命中附加结算：
        /// 辐射污染（rad 环 40%：radiate=40 + radSet tick+2400 + markDirty）/ 地形湮灭（terra 环 55%：
        /// rng&lt;0.7 掷/tile、山地板留、BURNT 落地）/ 军团士气打击（morale&gt;0：r+2.5 内敌军团
        /// max(5, ·-w.morale)、src 国豁免）。WbBail 五处命中结算 killCredit 接线消费（M-U10d/e/h 预埋）。
        /// DIVERGENCE：①e.r ?? w.radius 的 undefined 态生产面不可达（fx 构造 r 恒数字——WbFx.r
        /// 非 null 直用）；②a.morale ?? 60 同理（armies 构建面恒写 morale——WbArmy.morale 非 null）。</summary>
        public static void EmergentPayload(WbWorld w, WbFx e)
        {
            var wep = e.wid.HasValue ? WeaponGet(w, e.wid.Value) : null;                                      // L9404（get(e.wid ?? -1)——null 恒 miss 等价）
            if (wep == null) return;                                                                          // L9405
            double r = e.r;                                                                                    // L9406（e.r ?? w.radius——DIVERGENCE-1 直用）
            if (JTruthy(wep["rad"]))                                                                          // L9407
            {
                // 辐射污染：落点半径 40% 内 tile 染辐射（radSet 到期自动衰减）
                int rr = Math.Max(1, (int)WbMath.JsRound(r * 0.4));                                            // L9409
                for (int yy = (int)Math.Floor(e.y - rr); yy <= e.y + rr; yy++)                                  // L9410（上界 e.y+rr 非整——JS 同形）
                {
                    for (int xx = (int)Math.Floor(e.x - rr); xx <= e.x + rr; xx++)                              // L9411
                    {
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                   // L9412
                        if (WbMath.FdHypot(xx + 0.5 - e.x, yy + 0.5 - e.y) > rr) continue;                      // L9413
                        int i = yy * WbWorld.W + xx;                                                            // L9414（idx）
                        if (WbWorld.IsLand(w.terrain[i]))                                                      // L9415
                        {
                            w.radiate[i] = 40;                                                                  // L9416
                            w.radSet[i] = w.tickCount + 2400;                                                  // L9417（Map.set 覆写幂等）
                            w.MarkDirty(i);                                                                     // L9418
                        }
                    }
                }
            }
            if (JTruthy(wep["terra"]))                                                                        // L9423
            {
                // 奇点湮灭：中心焦土化（不动山——保留地质）
                int rr = Math.Max(1, (int)WbMath.JsRound(r * 0.55));                                           // L9425
                for (int yy = (int)Math.Floor(e.y - rr); yy <= e.y + rr; yy++)                                  // L9426
                {
                    for (int xx = (int)Math.Floor(e.x - rr); xx <= e.x + rr; xx++)                              // L9427
                    {
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                   // L9428
                        if (WbMath.FdHypot(xx + 0.5 - e.x, yy + 0.5 - e.y) > rr) continue;                      // L9429
                        int i = yy * WbWorld.W + xx;                                                            // L9430
                        if (WbWorld.IsLand(w.terrain[i]) && w.terrain[i] != WbConstants.T_MOUNTAIN && w.Rng() < 0.7)   // L9431（terra 掷/tile）
                            WbBailRelay.SetTerrain(w, i, WbConstants.T_BURNT);
                    }
                }
            }
            double morale = JNullish(wep, "morale", 0);                                                        // L9435（w.morale > 0）
            if (morale > 0)
            {
                // 军团士气打击（EMP/恐慌波）：半径 + 2 内敌军团士气崩落
                foreach (var a in w.armies)                                                                    // L9437
                {
                    if (e.src.HasValue && a.civ == e.src.Value) continue;                                      // L9438（e.src !== undefined && a.civ === e.src）
                    if (WbMath.FdHypot(a.x - e.x, a.y - e.y) < r + 2.5)                                        // L9439
                        a.morale = Math.Max(5, a.morale - morale);                                              // L9439（a.morale ?? 60——DIVERGENCE-2；max(5, ·-w.morale)）
                }
            }
        }

        /// <summary>engine wwCountKill killCredit 反馈支路 L8697-8715 —— 击杀验证架构：
        /// w.kills++ → 攻方学说向武器剖面漂移（P.rad|terra→terror / D.sat+G.sat>0.3→saturation /
        /// G.acc>0.7→precision / G.acc<0.5∧pw≤1→attrition，均钳 0.95）→ q[0] 装药品质上行钳 1.4。
        /// WbCivSim.WwCountKill 头部调用（域家族归铸域——JNullish/JTruthy 私有助手同文件消费）。</summary>
        public static void WwKillFeedback(WbWorld w)
        {
            if (!w.killCredit.HasValue) return;                                                                // L8698（killCredit != null）
            var wep = WeaponGet(w, w.killCredit.Value);                                                        // L8699
            if (wep == null) return;                                                                          // L8700（if (w)）
            wep["kills"] = (int)JNullish(wep, "kills", 0) + 1;                                                  // L8701（w.kills++ 整型保型）
            // 武器架构 v2 反馈：击杀验证架构 → 攻方学说向该武器剖面漂移 + 装药品质进化
            int wciv = wep.Value<int>("civ");                                                                  // L8703
            WbCiv attacker = wciv >= 0 && wciv < w.civs.Count ? w.civs[wciv] : null;                           // L8703（this.civs[w.civ] 越界 = undefined）
            if (attacker != null && attacker.alive)
            {
                var doc = DoctrineOf(w, wciv);                                                                 // L8705
                var P = WcPayloads[(int)JNullish(wep, "pl", 1)];                                                // L8706
                var G = WcGuides[(int)JNullish(wep, "gd", 1)];                                                  // L8707
                var D = WcDeliveries[(int)JNullish(wep, "dl", 0)];                                              // L8708
                if (P.rad || P.terra) doc.terror = Math.Min(0.95, doc.terror + 0.006);                           // L8709
                if ((D.sat + G.sat) > 0.3) doc.saturation = Math.Min(0.95, doc.saturation + 0.006);              // L8710
                if (G.acc > 0.7) doc.precision = Math.Min(0.95, doc.precision + 0.006);                         // L8711
                if (G.acc < 0.5 && JNullish(wep, "pw", 0) <= 1) doc.attrition = Math.Min(0.95, doc.attrition + 0.006);   // L8712
            }
            var q = wep["q"] as JArray;                                                                        // L8714（if (w.q) w.q[0] = min(1.4, ·+0.012)）
            if (q != null) q[0] = Math.Min(1.4, q[0].Value<double>() + 0.012);
        }

        // ============================================================
        // 存档行面（L15287-15291 serialize / L15605-15620 applySave）
        // ============================================================

        /// <summary>engine L15287 weapons: [...this.emergentWeapons.values()].map((w) =&gt; ({ ...w }))
        /// ——插入序行克隆（JS {...w} 浅拷贝 vs JClone 深拷贝：往返无别名可观察面即等价——协议注记）</summary>
        public static JArray WeaponsRows(WbWorld w)
        {
            var arr = new JArray();
            foreach (var row in WeaponValues(w)) arr.Add(row.DeepClone());
            return arr;
        }

        /// <summary>engine L15290 dctr: [...entries()].map(([id, d]) =&gt; [id, Math.round(p*100)/100, ...])
        /// —— doctrinesKeys 插入序出列（JS Map [...entries()] 序镜像）</summary>
        public static JArray DctrRows(WbWorld w)
        {
            var arr = new JArray();
            foreach (int id in w.doctrinesKeys)
                if (w.doctrines.TryGetValue(id, out var d))
                    arr.Add(new JArray { id, WbMath.JsRound(d.precision * 100) / 100.0, WbMath.JsRound(d.saturation * 100) / 100.0, WbMath.JsRound(d.terror * 100) / 100.0, WbMath.JsRound(d.attrition * 100) / 100.0 });
            return arr;
        }

        /// <summary>engine L15291 ddef: [...entries()].map(([id, d]) =&gt; [id, Math.round(p), Math.round(a), Math.round(e)])
        /// —— defensesKeys 插入序出列</summary>
        public static JArray DdefRows(WbWorld w)
        {
            var arr = new JArray();
            foreach (int id in w.defensesKeys)
                if (w.defenses.TryGetValue(id, out var d))
                    arr.Add(new JArray { id, WbMath.JsRound(d.point), WbMath.JsRound(d.armor), WbMath.JsRound(d.evade) });
            return arr;
        }

        /// <summary>JS Number(row[k]) || d 助手（WbAgentLaws.JCoerceNum 同款镜像：字符串数字强转，
        /// ''→0/NaN→fallback/null→0→fallback）</summary>
        private static double JCoerceNumOr(JToken t, double d)
        {
            double v;
            if (t == null || t.Type == JTokenType.Null) v = double.NaN;
            else if (t.Type == JTokenType.Integer) v = (int)t;
            else if (t.Type == JTokenType.Float) v = (double)t;
            else if (t.Type == JTokenType.Boolean) v = (bool)t ? 1 : 0;
            else if (t.Type == JTokenType.String)
            {
                string s = t.ToString().Trim();
                v = s.Length == 0 ? 0 : (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out double pv) ? pv : double.NaN);
            }
            else v = double.NaN;
            return !double.IsNaN(v) && v != 0 ? v : d;
        }

        /// <summary>engine L15605-15620 applySave dyn 段恢复面（weapons 形状门透传 + weapSeq max 保底 +
        /// dctr Number||0.2 + ddef max(0, Number||0)）——WbSave2.st 面并存语义同源（M-U29 直演先例）</summary>
        public static void ApplyDynRows(WbWorld w, JArray weapons, double weapSeqVal, JArray dctr, JArray ddef)
        {
            w.emergentWeapons = new Dictionary<int, JObject>();                          // 恢复前置清（gen applyRows 手术同构）
            w.emergentWeaponKeys = new List<int>();
            w.doctrines = new Dictionary<int, WbWorld.WbDoctrine>();
            w.doctrinesKeys = new List<int>();
            w.defenses = new Dictionary<int, WbWorld.WbDefense>();
            w.defensesKeys = new List<int>();
            w.weapSeq = 1;                                                               // L15608 首参
            foreach (var t in weapons ?? new JArray())                                   // L15605-15607
            {
                if (!(t is JObject wp)) continue;                                        //（w && 形状门）
                if (!JIsNum(wp["id"], out double idv)) continue;                         //（typeof w.id === 'number'）
                if (wp["name"] == null || wp["name"].Type != JTokenType.String) continue;   //（typeof w.name === 'string'）
                WeaponSet(w, (int)idv, (JObject)wp.DeepClone());                         //（{ ...w } 行透传）
            }
            double ksMax = 1; foreach (int k in w.emergentWeaponKeys) ksMax = Math.Max(ksMax, k + 1);   // L15608（...keys.map(x => x+1)）
            w.weapSeq = (int)Math.Max(Math.Max(1, weapSeqVal), ksMax);
            foreach (var t in dctr ?? new JArray())                                      // L15610-15613
            {
                if (!(t is JArray row) || row.Count < 5) continue;
                DoctrineSet(w, (int)((double)row[0]), new WbWorld.WbDoctrine             //（row[0] | 0 截断）
                {
                    precision = JCoerceNumOr(row[1], 0.2),
                    saturation = JCoerceNumOr(row[2], 0.2),
                    terror = JCoerceNumOr(row[3], 0.2),
                    attrition = JCoerceNumOr(row[4], 0.2),
                });
            }
            foreach (var t in ddef ?? new JArray())                                      // L15614-15617
            {
                if (!(t is JArray row) || row.Count < 4) continue;
                DefenseSet(w, (int)((double)row[0]), new WbWorld.WbDefense
                {
                    point = Math.Max(0, JCoerceNumOr(row[1], 0)),
                    armor = Math.Max(0, JCoerceNumOr(row[2], 0)),
                    evade = Math.Max(0, JCoerceNumOr(row[3], 0)),
                });
            }
        }
    }
}
