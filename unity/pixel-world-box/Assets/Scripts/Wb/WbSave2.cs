// ============================================================
// WbSave2.cs — M-U6b 存档容器恢复全链 + serialize 写方向
// 蓝本：engine.ts applySave L15309-15911 容器恢复段（M-U6a 已覆盖数学段：解码/variant/cam/occ/rowsToUnits/validate）
//       + serialize L15187-15305 写方向 + emergence.ts visFromGene L46 + agentLaws.ts normalizeLaw L178
// 纪律①：只从蓝本机械翻译，不从记忆重写。
// 宿主接力协议（事件流暂存，WbNature 先例）：
//   - nature.initPlates/recomputePlates/rebuildWaterTiers/WorldSim/flushDirty/flushProps/rebuildAmbLists/
//     statsTick/terrainImg 重绘 = 宿主侧（State.Nature.PlateCx/Cy 为钳制面预写值；钩子后值不进对账面）
//   - WB.onWorldReset/WBB.touchMeta/WB.invalidateRaceFlags/enemyLut/invalidateVisCache/activeBattles/onEvent
//     = 宿主钩子（no-op）
//   - techModsOf = 宿主查表（WbCivSim.TechModsOf 真相源；黄金每场景 techMods 行提供）
//   - casusText = 宿主查表（WbCivSim.CasusText 真相源；黄金 casusTable 提供 [a,b,reason,goal,text]）
//   - validateCond 条件树 = M-O 神谕域宿主侧（normalizeTrigger condition 分支 cond 原样透传）
// 查表上提（黄金 meta.lifted，C# 零副本）：RACES/ITEM_DEFS/SLOT_FIELD/TOOL_BY_ID/TECH_BY_KEY/TECH_CATS/
//   DEFAULT_LAWS/DYN_TINTS/ALLIANCE_COLORS/BASE_CIV_RACES/STORM_NAMES(周期探测)/EVENT_KINDS/ACTION_KINDS/
//   waterT/iceT/zombieR
// ============================================================
namespace PixelWorldBox.Wb
{
    using System;
    using System.Collections.Generic;
    using Newtonsoft.Json.Linq;

    /// <summary>查表上提宿主包（黄金 meta.lifted 反序列化 + 每场景 techMods/casusTable）</summary>
    public class WbSaveHost
    {
        public Dictionary<string, JObject> Races = new Dictionary<string, JObject>();
        public Dictionary<string, JObject> ItemDefs = new Dictionary<string, JObject>();
        public Dictionary<string, string> SlotField = new Dictionary<string, string>();
        public HashSet<string> ToolIds = new HashSet<string>();
        public HashSet<string> TechKeys = new HashSet<string>();
        public List<string> TechCats = new List<string>();
        public HashSet<string> ActionKinds = new HashSet<string>();
        public HashSet<string> EventKinds = new HashSet<string>();
        public string[] DynTints = new string[0];
        public string[] AllianceColors = new string[0];
        public string[] StormNames = new string[0];
        public int[] BaseCivRaces = new int[0];
        public int[] WaterT = new int[0];
        public int IceT;
        public int ZombieR;
        /// <summary>灰烬平流场格数（AW×AH = 32×20 = 640，lifted.ashCells）</summary>
        public int AshCells = 640;
        public JObject DefaultLaws = new JObject();
        /// <summary>casusText 查表行 [a, b, reason, goal, text]（WbCivSim.CasusText 宿主真相）</summary>
        public List<JArray> CasusTable = new List<JArray>();
        /// <summary>本场景 techMods 查表行 [civId, dmg, hp]（WbCivSim.TechModsOf 宿主真相）</summary>
        public List<double[]> TechMods = new List<double[]>();
        /// <summary>宿主 nature.plateN（NatureSystem 域状态；seed 派生，黄金场景宿主提供）</summary>
        public int PlateN;
        /// <summary>serialize 写方向的宿主 nature 域输入（W 场景黄金 hostNat 提供）</summary>
        public double[] HookPlateCx = new double[0];
        public double[] HookPlateCy = new double[0];
        public HashSet<int> BoundaryStress = new HashSet<int>();
        public double[][] HotspotsHost;               // M-U6c：serialize nat.hot 的宿主钩子上提（恢复分支未命中时 initPlates 真相 [x,y,heat]；命中 = null，C# 从状态袋自算）

        public bool IsWater(int t)
        {
            foreach (var w in WaterT) if (w == t) return true;
            return false;
        }
    }

    /// <summary>自然引擎恢复态（宿主钩子前钳制面 + 全量动态量）</summary>
    public class WbNatureSave
    {
        public double[] PlateCx;                       // 恢复分支命中时 = clamp(pcx,4,W-4)（宿主 recomputePlates 钩子会覆写，不进对账面）；未命中 = null（宿主 initPlates 域）
        public double[] PlateCy;
        public int PlateEpoch;
        public List<double[]> Hotspots = new List<double[]>();   // [x, y, heat]
        public List<double[]> Stress = new List<double[]>();     // [i, q/8]（恢复注入行；dump 过滤 >0）
        public double Ash;
        public bool AshFFilled;                        // 旧档无 ashF 行 → 全场均匀播撒 ash（宿主 fill 语义）
        public List<double[]> AshF = new List<double[]>();       // [ci, clamp(q/200)]
        public int SeasonOffset;
        public int[] Counters = new int[10];
        public int StormSeq;
        public List<JObject> Storms = new List<JObject>();
        public int LastSeason = -1;                    // 换季检测强制刷新
    }

    /// <summary>applySave 容器恢复态（save 域引擎状态袋）</summary>
    public class WbSaveState
    {
        public int Seed, TickCount, UnitSeq, CivSeq, ToastSeq, EventSeq, ItemSeq, TriggerSeq, ArmySeq, DirSeq, EvoSeq, FamilySeq, DynSeq, WeapSeq, TraitSeq, AllianceSeq, EmTechSeq, IdeaSeq;
        public double YearF;
        public object VictoryCiv;
        public bool MultiCivSeen;
        public uint RngA;
        public bool CamApplied;
        public double CamX, CamY, CamZoom;

        public byte[] Terrain = new byte[0], Variant = new byte[0], Building = new byte[0], Fire = new byte[0], Radiate = new byte[0], RiverDir = new byte[0], Road = new byte[0];
        public short[] Owner = new short[0];

        public List<int> FireSet = new List<int>(), Frozen = new List<int>(), RiverTiles = new List<int>();
        public List<JArray> Occ = new List<JArray>();                  // [i, civ, str]
        public List<JArray> Regrow = new List<JArray>(), RadDue = new List<JArray>();
        public Dictionary<string, double> Rel = new Dictionary<string, double>();
        public Dictionary<string, double> WarShame = new Dictionary<string, double>();
        public Dictionary<string, double> RaceRel = new Dictionary<string, double>();
        public Dictionary<int, int> WildCount = new Dictionary<int, int>();
        public Dictionary<int, int> AllianceOf = new Dictionary<int, int>();
        public List<string> Met = new List<string>();

        public List<JObject> Units = new List<JObject>();
        public Dictionary<int, JObject> UnitById = new Dictionary<int, JObject>();
        public int DroppedUnknownRace;
        public List<JObject> Civs = new List<JObject>();
        public List<JObject> Buildings = new List<JObject>();
        public Dictionary<int, int> BIdx = new Dictionary<int, int>();
        public List<JObject> Events = new List<JObject>();
        public bool ZombieNoted;
        public JObject Laws = new JObject();
        public List<JArray> Items = new List<JArray>();                // [id, kind, x, y]
        public List<JObject> Triggers = new List<JObject>();
        public List<JObject> Armies = new List<JObject>();
        public Dictionary<string, JObject> WarData = new Dictionary<string, JObject>();
        public List<JObject> Directives = new List<JObject>();
        public Dictionary<int, JObject> SpeciesBase = new Dictionary<int, JObject>();

        public Dictionary<string, JObject> EmTechs = new Dictionary<string, JObject>();
        public Dictionary<string, JObject> EmIdeas = new Dictionary<string, JObject>();
        public Dictionary<int, JObject> DynRaces = new Dictionary<int, JObject>();     // info
        public List<int> DynRacesKeys = new List<int>();   // JS Map 插入序台账（serialize dyn.races 行序 = 注册表恢复序，2026-10-29）
        public Dictionary<int, JObject> RacesOut = new Dictionary<int, JObject>();     // 注册表（host 克隆 + dyn 重注册 + rmods 补丁）
        public List<int> CivRaces = new List<int>();
        public Dictionary<int, JObject> EmergentWeapons = new Dictionary<int, JObject>();
        public Dictionary<int, double[]> Doctrines = new Dictionary<int, double[]>();  // [precision, saturation, terror, attrition]
        public Dictionary<int, double[]> Defenses = new Dictionary<int, double[]>();   // [point, armor, evade]
        public Dictionary<string, JObject> DynTraits = new Dictionary<string, JObject>();
        public List<JObject> EvoNodes = new List<JObject>();
        public Dictionary<string, int> EvoIndex = new Dictionary<string, int>();
        public Dictionary<int, JObject> Families = new Dictionary<int, JObject>();
        public List<JObject> AgentLaws = new List<JObject>();
        public int AlwsSeq = 1;
        public JObject AlwsCounters = new JObject();

        public WbNatureSave Nature = new WbNatureSave();
        public JObject WorldWar = new JObject();
        public Dictionary<string, double> WwTruce = new Dictionary<string, double>();
        public int WwNuke = -600, WwAnti = -1200, WwFrenzy = -1;

        public List<JObject> Alliances = new List<JObject>();
        public Dictionary<string, int> CreationRaceIds = new Dictionary<string, int>();
        public Dictionary<int, string> RaceMods = new Dictionary<int, string>();
        public Dictionary<string, string> ItemMods = new Dictionary<string, string>();
        public HashSet<int> RaceOrigKeys = new HashSet<int>();
        public HashSet<string> ItemOrigKeys = new HashSet<string>();
        public List<int> RaceThrived = new List<int>();

        public int LastClash, LastReinforce, LastVolley;               // lastWarSet 清空 + 事件戳复位
        public int Effects, Shake, Acc;                                // 瞬态清空（0/0/0）
        public object FollowId, SelectedId;                            // null
    }

    public static class WbSave2
    {
        // ---------------- JS 数值语义助手（M-U6a WbSave.IsNum 协议延续） ----------------
        private static bool JIsNum(JToken t, out double v)
        {
            v = 0;
            if (t == null) return false;
            if (t.Type == JTokenType.Integer) { v = (int)t; return true; }
            if (t.Type == JTokenType.Float) { v = (double)t; return true; }
            return false;
        }

        /// <summary>raceDefOf（save2-transcript L497）：动态注册表优先 → 宿主静态注册表回退</summary>
        private static JObject RaceDefOf(WbSaveState st, WbSaveHost h, int race)
        {
            if (st.RacesOut.TryGetValue(race, out var r)) return r;
            return h.Races.TryGetValue(race.ToString(), out var r2) ? r2 : null;
        }
        /// <summary>Number(v) || d —— 0/NaN/缺失 → d（JS 真值链）</summary>
        private static double JNumOr(JToken t, double d)
        {
            if (!JIsNum(t, out double v)) return d;
            return v != 0 ? v : d;
        }
        /// <summary>JS ?? 语义（nullish：0/NaN 是合法值不回退——JNumOr 的 || 语义误伤 0 值域）</summary>
        private static double JNumNullish(JToken t, double d)
        {
            return JIsNum(t, out double v) ? v : d;
        }
        /// <summary>Number(v) || 0</summary>
        private static double JNum0(JToken t) => JNumOr(t, 0);
        /// <summary>x | 0（ToUint 域内截断；JS ToInt32 域内值等价 C# (int) 截断）</summary>
        private static int JInt(JToken t)
        {
            JIsNum(t, out double v);
            return (int)v;
        }
        /// <summary>JS Math.round 半上（域内无负半界时 Floor(v+0.5) 全域等价——含 -0.5→0/-1.5→-1，M-U5a 已验证）</summary>
        private static double JRound(double v) => Math.Floor(v + 0.5);
        /// <summary>JS Number(s) 字符串转换（emT effects/emI mods csv 值域——"0.1"→0.1；""→0；"abc"→NaN）</summary>
        private static double JNumJs(string s)
        {
            if (s == null) return WbMath.JsNaN;
            if (s.Trim().Length == 0) return 0;   // JS Number('') === 0
            return double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double v) ? v : WbMath.JsNaN;
        }
        /// <summary>Number(v) || 0（csv 值域）</summary>
        private static double JsNum0(string s) { var v = JNumJs(s); return double.IsNaN(v) ? 0 : v; }
        /// <summary>Math.max(0, Math.min(hi, v)) 链</summary>
        private static double JClamp(double v, double lo, double hi) => Math.Max(lo, Math.Min(hi, v));
        private static JObject JClone(JToken t) => t == null ? null : (JObject)t.DeepClone();
        private static JArray JArrClone(JToken t) => t == null ? null : (JArray)t.DeepClone();
        private static bool JTruthy(JToken t)
        {
            // JS 真值语义全档：false/0/NaN/''/null/undefined → falsy；对象/数组 → truthy
            // （原实现只挡 Boolean false 与 null——Integer 0 误判 truthy，als.bonded=0 → 1 即此根因，2026-10-29 修复）
            if (t == null || t.Type == JTokenType.Null || t.Type == JTokenType.Undefined) return false;
            switch (t.Type)
            {
                case JTokenType.Boolean: return (bool)t;
                case JTokenType.Integer: return (long)t != 0;
                case JTokenType.Float: { double d = (double)t; return d != 0 && !double.IsNaN(d); }
                case JTokenType.String: return ((string)t).Length > 0;
                default: return true;
            }
        }

        /// <summary>JS Math.floor(yearF)（startYear 兜底）</summary>
        private static int JFloor(double v) => (int)Math.Floor(v);

        /// <summary>rowToTrigger（engine.ts L45-63 机械翻译）——字段校验，损坏行抛错（InvalidOperationException = 调用方捕获 toast）</summary>
        public static JObject RowToTrigger(JToken tok, WbSaveHost h)
        {
            if (!(tok is JArray row) || row.Count != 13) throw new InvalidOperationException("存档触发器行损坏");
            JObject cond;
            try
            {
                // ⚠️ JValue(string).ToString(Formatting) 返回带引号 JSON 表示 → DeserializeObject 得字符串文档非对象 —— String 格必须 Value<string>() 原始串（2026-10-29 修复）
                var condText = row[2] == null || row[2].Type == JTokenType.Null ? null
                    : row[2].Type == JTokenType.String ? row[2].Value<string>()
                    : row[2].ToString(Newtonsoft.Json.Formatting.None);
                cond = condText == null ? null : Newtonsoft.Json.JsonConvert.DeserializeObject<JObject>(condText);
            }
            catch { throw new InvalidOperationException("存档触发器条件损坏"); }
            // JSON.parse 成功但非对象/缺 kind/非 string → 同文案（JS typeof cond.kind !== 'string'）
            if (cond == null || cond["kind"] == null || cond["kind"].Type != JTokenType.String)
                throw new InvalidOperationException("存档触发器条件损坏");
            string action = row[3] == null ? null : row[3].ToString();
            if (string.IsNullOrEmpty(action) || !h.ToolIds.Contains(action))
                throw new InvalidOperationException($"存档触发器动作无效: {action ?? "undefined"}");
            JIsNum(row[12], out double nfy);
            bool nfyFin = row[12] != null && row[12].Type != JTokenType.Null && JIsNum(row[12], out nfy)
                && !double.IsNaN(nfy) && !double.IsInfinity(nfy);
            return new JObject
            {
                ["id"] = JInt(row[0]),
                ["name"] = row[1] == null ? "" : row[1].ToString(),
                ["cond"] = cond,
                ["action"] = action,
                ["brush"] = row[4] ?? JValue.CreateNull(),
                ["x"] = row[5] ?? JValue.CreateNull(),
                ["y"] = row[6] ?? JValue.CreateNull(),
                ["r"] = row[7] ?? JValue.CreateNull(),
                ["enabled"] = JTruthy(row[8]),
                ["once"] = JTruthy(row[9]),
                ["fired"] = JInt(row[10]),
                ["cd"] = JInt(row[11]),
                ["nextFireYear"] = nfyFin ? nfy : 0,
            };
        }

        // ============================================================
        // ApplySave 容器恢复全链（applySave L15309-15911 机械翻译）
        // 抛错语义与真实现一致：版本/数组/单位行/触发器行损坏 → InvalidOperationException（调用方捕获 toast）
        // ============================================================
        public static WbSaveState ApplySave(JObject data, WbSaveHost h)
        {
            var st = new WbSaveState();
            int version = JInt(data["v"]);
            if (version != 1 && version != 2) throw new InvalidOperationException($"不支持的存档版本: {data["v"]?.ToString(Newtonsoft.Json.Formatting.None) ?? "undefined"}");
            if (!(data["units"] is JArray) || !(data["civs"] is JArray) || !(data["buildings"] is JArray))
                throw new InvalidOperationException("存档数据结构损坏");
            // 造物工坊：图鉴注册解除 + 覆写还原（fresh 宿主态 no-op；creg/rmods 稍后重链）
            bool isV2 = version == 2;
            Func<string, int, byte[]> dec = (s, expect) => isV2 ? WbSave.RleDecode(s, expect) : WbSave.B64Decode(s, expect);
            int WH = 256 * 160;

            st.Terrain = dec((string)data["terrain"], WH);
            // v2 不存 variant（纯随机色彩抖动）：按 seed 确定性重算（hash2 纯函数）；v1 直接解码
            if (isV2)
            {
                st.Variant = new byte[WH];
                int seed999 = (int)data["seed"] + 999;
                for (int y = 0; y < 160; y++) for (int x = 0; x < 256; x++)
                        st.Variant[y * 256 + x] = (byte)Math.Floor(WbSave.Hash2(x, y, seed999) * 255);
            }
            else
            {
                st.Variant = dec((string)data["variant"], WH);
            }
            byte[] ownerBytes = dec((string)data["owner"], WH * 2);
            st.Owner = new short[WH];
            for (int i = 0; i < WH; i++) st.Owner[i] = (short)(ownerBytes[i * 2] | (ownerBytes[i * 2 + 1] << 8));
            st.Building = dec((string)data["building"], WH);
            st.Fire = dec((string)data["fire"], WH);
            st.Radiate = dec((string)data["radiate"], WH);

            // —— 恢复标量状态（L15335-15348）——
            st.Seed = JInt(data["seed"]);
            st.TickCount = JInt(data["tickCount"]);
            st.YearF = JIsNum(data["yearF"], out double yf) ? yf : 0;
            st.UnitSeq = JInt(data["unitSeq"]);
            st.CivSeq = JInt(data["civSeq"]);
            st.ToastSeq = JInt(data["toastSeq"]);
            st.VictoryCiv = data["victoryCiv"] != null && data["victoryCiv"].Type != JTokenType.Null ? (object)JInt(data["victoryCiv"]) : null;
            st.MultiCivSeen = JTruthy(data["multiCivSeen"]);
            var cam = data["cam"] as JObject;
            if (cam != null && WbSave.CamFinite(JNum0(cam["x"]), JNum0(cam["y"]), JNum0(cam["zoom"]))
                && JIsNum(cam["x"], out _) && JIsNum(cam["y"], out _) && JIsNum(cam["zoom"], out _))
            {
                st.CamApplied = true;
                st.CamX = JNum0(cam["x"]); st.CamY = JNum0(cam["y"]);
                st.CamZoom = WbSave.CamZoomClamp(JNum0(cam["zoom"]));
            }
            // 随机数无法序列化闭包状态，用 seed+tick 重新播种（L15348）
            st.RngA = WbSave.ReseedRng(st.Seed, st.TickCount);

            // —— v3 涌现层早期恢复（L15350-15387；先于文明处理）——
            st.EmTechSeq = 1;
            if (data["emT"] is JArray emT)
            {
                foreach (var tok in emT)
                {
                    if (!(tok is JArray row) || row.Count < 6) continue;
                    string key = row[0]?.ToString() ?? "";
                    string name = row[1]?.ToString() ?? "";
                    int catIdx = JInt(row[2]);
                    double cost = JNumOr(row[3], 120);
                    double gen = JNumOr(row[4], 1);
                    var effs = new JArray();
                    var segs = (row[5]?.ToString() ?? "").Split(',');
                    foreach (var seg in segs)
                    {
                        if (!seg.Contains(':')) continue;
                        var kv = seg.Split(':');
                        effs.Add(new JObject { ["k"] = kv[0], ["v"] = JsNum0(kv.Length > 1 ? kv[1] : null) });
                    }
                    int ci = Math.Max(0, Math.Min(h.TechCats.Count - 1, catIdx));
                    string cat = h.TechCats.Count > 0 ? h.TechCats[ci] : "";
                    st.EmTechs[key] = new JObject { ["key"] = key, ["name"] = name, ["cat"] = cat, ["cost"] = Math.Max(10, cost), ["gen"] = Math.Max(1, gen), ["effects"] = effs, ["desc"] = "" };
                    // emTechSeq = Math.max(emTechSeq, Number(gen) + 1)——NaN 传播语义（JS Math.max(NaN)→NaN）
                    double seqV = JNumOr(row[4], WbMath.JsNaN) + 1;
                    if (!double.IsNaN(seqV)) st.EmTechSeq = (int)Math.Max(st.EmTechSeq, seqV);
                }
            }
            st.IdeaSeq = 1;
            if (data["emI"] is JArray emI)
            {
                foreach (var tok in emI)
                {
                    if (!(tok is JArray row) || row.Count < 4) continue;
                    string key = row[0]?.ToString() ?? "";
                    var mods = new JObject();
                    var segs = (row[3]?.ToString() ?? "").Split(',');
                    foreach (var seg in segs)
                    {
                        if (!seg.Contains(':')) continue;
                        var kv = seg.Split(':');
                        string k = kv[0];
                        double num = JsNum0(kv.Length > 1 ? kv[1] : null);
                        if (k == "gold" || k == "mil" || k == "know" || k == "repro" || k == "wear") mods[k] = num;
                        else if (k == "stab") mods["stab"] = JRound(num);
                    }
                    st.EmIdeas[key] = new JObject { ["key"] = key, ["name"] = row[1]?.ToString() ?? "", ["desc"] = row[2]?.ToString() ?? "", ["mods"] = mods };
                    var sk = key.Length >= 2 ? key.Substring(2) : "";
                    if (int.TryParse(sk, out int iv)) st.IdeaSeq = (int)Math.Max(st.IdeaSeq, iv + 1);
                }
            }
            st.TraitSeq = 1;
            st.EvoSeq = 1;

            // —— 派生集合重建（L15397-15422）——
            for (int i = 0; i < st.Fire.Length; i++) if (st.Fire[i] > 0) st.FireSet.Add(i);
            for (int i = 0; i < st.Terrain.Length; i++) if (st.Terrain[i] == h.IceT) st.Frozen.Add(i);
            // 瞬态 decals 清空（血迹/尸骸/洪水/湿沙不随存档走）——宿主态 no-op
            byte[] river = data["river"] != null && data["river"].Type == JTokenType.String && ((string)data["river"]).Length > 0
                ? dec((string)data["river"], WH) : new byte[WH];
            st.RiverDir = river;
            for (int i = 0; i < river.Length; i++) if (river[i] > 0 && h.IsWater(st.Terrain[i])) st.RiverTiles.Add(i);
            var roadTok = data["road"];
            st.Road = roadTok != null && roadTok.Type == JTokenType.String && ((string)roadTok).Length > 0
                ? dec((string)roadTok, WH) : new byte[WH];
            if (data["regrow"] is JArray regrow)
                foreach (var t in regrow) if (t is JArray r && r.Count >= 2) st.Regrow.Add(new JArray { JInt(r[0]), JIsNum(r[1], out double at1) ? at1 : 0 });
            if (data["radDue"] is JArray radDue)
                foreach (var t in radDue) if (t is JArray r && r.Count >= 2) st.RadDue.Add(new JArray { JInt(r[0]), JIsNum(r[1], out double at2) ? at2 : 0 });

            // —— 恢复实体列表与索引（L15424-15440）——
            List<JObject> savedUnits;
            if (isV2 && data["u"] is JArray uRows && uRows.Count > 1)
            {
                savedUnits = new List<JObject>();
                var header = WbSave.RowsHeader(uRows);
                for (int r = 1; r < uRows.Count; r++)
                {
                    if (!(uRows[r] is JArray row) || row.Count != header.Length)
                        throw new InvalidOperationException("存档单位行损坏");
                    var u = new JObject();
                    for (int c = 0; c < header.Length; c++)
                    {
                        var tok = row[c];
                        if (tok.Type == JTokenType.Null) continue; // null = 字段缺省
                        u[header[c]] = tok.Type == JTokenType.Integer ? (JToken)(int)tok : (JToken)tok.DeepClone();
                    }
                    savedUnits.Add(u);
                }
            }
            else
            {
                savedUnits = new List<JObject>();
                foreach (var t in (JArray)data["units"]) savedUnits.Add(JClone(t));
            }
            foreach (var u in savedUnits)
            {
                if (!JIsNum(u["id"], out _) || !JIsNum(u["race"], out _))
                    throw new InvalidOperationException("存档单位数据损坏");
                if (u["boat"] == null || u["boat"].Type == JTokenType.Null) u["boat"] = 0;
                if (u["boatTTL"] == null || u["boatTTL"].Type == JTokenType.Null) u["boatTTL"] = 0;
                // 存档兼容护栏：丢弃未知种族单位（跨版本枚举变更 / 动态种化失联）
                int race = JInt(u["race"]);
                if (!h.Races.ContainsKey(race.ToString())) { st.DroppedUnknownRace++; continue; }
                st.Units.Add(u);
            }
            // 旧档迁移：trk 饰品槽 → bts/rng；job 缺省 0（migrateLegacyGear L14593）
            foreach (var u in st.Units)
            {
                var trk = u["trk"];
                if (trk != null && trk.Type == JTokenType.String)
                {
                    if (h.ItemDefs.TryGetValue((string)trk, out var d) && d["slot"] != null && h.SlotField.TryGetValue((string)d["slot"], out var field))
                        u[field] = (string)trk;
                    u["trk"] = null;
                }
                if (u["job"] == null || u["job"].Type == JTokenType.Null) u["job"] = 0;
                st.UnitById[JInt(u["id"])] = u;
            }
            // 野生动物分种族计数重建（isCiv 读恢复前注册表——顺序保真）
            foreach (var u in st.Units)
            {
                bool dead = JTruthy(u["dead"]);
                if (dead) continue;
                var rd = RaceDefOf(st, h, JInt(u["race"]));
                bool isCiv = rd != null && JTruthy(rd["isCiv"]);
                if (isCiv) continue;
                int r2 = JInt(u["race"]);
                st.WildCount.TryGetValue(r2, out int wc);
                st.WildCount[r2] = wc + 1;
            }

            // —— 文明恢复 + 默认值（L15441-15470）——
            foreach (var t in (JArray)data["civs"])
            {
                var c = JClone(t);
                if (c["colonizeCd"] == null || c["colonizeCd"].Type == JTokenType.Null) c["colonizeCd"] = 0;
                if (c["history"] == null || c["history"].Type == JTokenType.Null) c["history"] = new JArray();
                if (c["gold"] == null || c["gold"].Type == JTokenType.Null) c["gold"] = 0;
                if (c["knowledge"] == null || c["knowledge"].Type == JTokenType.Null) c["knowledge"] = 0;
                if (c["techs"] == null || c["techs"].Type == JTokenType.Null) c["techs"] = new JArray();
                if (c["research"] == null || c["research"].Type == JTokenType.Null) c["research"] = null;
                if (c["researchP"] == null || c["researchP"].Type == JTokenType.Null) c["researchP"] = 0;
                if (c["gov"] == null || c["gov"].Type == JTokenType.Null) c["gov"] = 0;
                if (c["govYear"] == null || c["govYear"].Type == JTokenType.Null) c["govYear"] = 0;
                if (c["stability"] == null || c["stability"].Type == JTokenType.Null) c["stability"] = 70;
                if (c["culture"] == null || c["culture"].Type == JTokenType.Null) c["culture"] = 0;
                if (c["militarism"] == null || c["militarism"].Type == JTokenType.Null) c["militarism"] = 30;
                if (c["income"] == null || c["income"].Type == JTokenType.Null) c["income"] = 0;
                if (c["expense"] == null || c["expense"].Type == JTokenType.Null) c["expense"] = 0;
                if (c["festivalCd"] == null || c["festivalCd"].Type == JTokenType.Null) c["festivalCd"] = 0;
                if (c["ideas"] == null || c["ideas"].Type == JTokenType.Null) c["ideas"] = new JArray();
                c["tiles"] = c["tiles"] is JArray tiles ? tiles.DeepClone() : new JArray();
                c["frontier"] = c["frontier"] is JArray fr ? fr.DeepClone() : new JArray();
                c["color"] = c["color"] is JArray col ? col.DeepClone() : new JArray();
                st.Civs.Add(c);
            }
            // 科技/政体缓存重建 + 研究中的科技校验（防旧档脏数据；v3 涌现科技同样合法）
            foreach (var c in st.Civs)
            {
                var res = c["research"];
                if (res != null && res.Type == JTokenType.String)
                {
                    string rk = (string)res;
                    if (!h.TechKeys.Contains(rk) && !st.EmTechs.ContainsKey(rk)) { c["research"] = null; c["researchP"] = 0; }
                }
                // techModsOf(c.id) = 宿主查表（缓存重建宿主侧；对账面无缓存内容）
            }

            foreach (var t in (JArray)data["buildings"]) st.Buildings.Add(JClone(t));
            for (int i = 0; i < st.Buildings.Count; i++) st.BIdx[JInt(st.Buildings[i]["i"])] = i;

            if (data["rel"] is JArray rel)
                foreach (var t in rel) if (t is JArray r && r.Count >= 2) st.Rel[(string)r[0]] = JNum0(r[1]);
            if (data["met"] is JArray met)
                foreach (var t in met) if (t != null && t.Type != JTokenType.Null) st.Met.Add((string)t);

            // 恢复世界纪事（L15478-15483）
            if (data["events"] is JArray evs)
                foreach (var t in evs) st.Events.Add(JClone(t));
            if (data["eventSeq"] != null && data["eventSeq"].Type != JTokenType.Null) st.EventSeq = JInt(data["eventSeq"]);
            else st.EventSeq = (st.Events.Count > 0 && JIsNum(st.Events[0]["id"], out double e0) ? (int)e0 : 0) + 1;
            bool hasZombie = false;
            foreach (var e in st.Events) if ((string)e["kind"] == "zombie") { hasZombie = true; break; }
            st.WildCount.TryGetValue(h.ZombieR, out int zc);
            st.ZombieNoted = hasZombie && zc >= 20;

            // 恢复世界法则与地面物品（L15485-15491）
            st.Laws = (JObject)h.DefaultLaws.DeepClone();
            if (data["laws"] is JObject dl)
                foreach (var p in dl.Properties()) st.Laws[p.Name] = p.Value.DeepClone();
            if (data["items"] is JArray items)
                foreach (var t in items) if (t is JArray r && r.Count >= 4)
                        st.Items.Add(new JArray { r[0]?.DeepClone() ?? 0, (string)r[1], r[2]?.DeepClone() ?? 0, r[3]?.DeepClone() ?? 0 }); // id/kind/x/y 全透传（L15487 无数值转换）
            if (data["itemSeq"] != null && data["itemSeq"].Type != JTokenType.Null) st.ItemSeq = JInt(data["itemSeq"]);
            else
            {
                int mx = 0;
                foreach (var it in st.Items) mx = (int)Math.Max(mx, JInt(it[0]));
                st.ItemSeq = mx + 1;
            }
            // 恢复事件触发器（损坏行抛错拒绝整档）
            if (data["triggers"] is JArray trigs)
                foreach (var t in trigs) st.Triggers.Add(RowToTrigger(t, h));
            if (data["triggerSeq"] != null && data["triggerSeq"].Type != JTokenType.Null) st.TriggerSeq = JInt(data["triggerSeq"]);
            else
            {
                int mx = 0;
                foreach (var t in st.Triggers) mx = (int)Math.Max(mx, JInt(t["id"]));
                st.TriggerSeq = mx + 1;
            }

            // —— 恢复军团方阵 / 战争档案 / 文明旨意（L15493-15522）——
            if (data["armies"] is JArray armies)
                foreach (var t in armies)
                {
                    var a = JClone(t);
                    a.Remove("clashWith"); a.Remove("battleSince"); // 赛 transient 复位（undefined 语义 = 键移除）
                    st.Armies.Add(a);
                }
            if (data["armySeq"] != null && data["armySeq"].Type != JTokenType.Null) st.ArmySeq = JInt(data["armySeq"]);
            else
            {
                int mx = 0;
                foreach (var a in st.Armies) mx = (int)Math.Max(mx, JInt(a["id"]));
                st.ArmySeq = mx + 1;
            }
            if (data["warData"] is JArray wars)
                foreach (var t in wars)
                {
                    if (!(t is JObject w)) continue;
                    string key = w["key"] != null && w["key"].Type == JTokenType.String ? (string)w["key"] : PairKey(JNum0(w["a"]), JNum0(w["b"]));
                    st.WarData[key] = NormalizeWarInfo(w, st, h);
                }
            // 动态战线恢复（旧档缺省 → 空战线；OccAccept 钳制 + 死文明跳过）
            foreach (var t in data["front"] as JArray ?? new JArray())
            {
                if (!(t is JArray r) || r.Count < 3) continue;
                int i = JInt(r[0]), c = JInt(r[1]);
                JIsNum(r[2], out double stv);
                bool civAlive = c >= 0 && c < st.Civs.Count && JTruthy(st.Civs[c]["alive"]);
                int? acc = WbSave.OccAccept(i, c, (int)stv, civAlive, WH);
                if (acc == null) continue;
                st.Occ.Add(new JArray { i, c, acc.Value });
            }
            if (data["warShame"] is JArray shame)
                foreach (var t in shame) if (t is JArray r && r.Count >= 2) st.WarShame[(string)r[0]] = JNum0(r[1]);
            if (data["directives"] is JArray dirs)
                foreach (var t in dirs) st.Directives.Add(JClone(t));
            if (data["dirSeq"] != null && data["dirSeq"].Type != JTokenType.Null) st.DirSeq = JInt(data["dirSeq"]);
            else
            {
                int mx = 0;
                foreach (var d in st.Directives) mx = (int)Math.Max(mx, JInt(d["id"]));
                st.DirSeq = mx + 1;
            }
            // 物种进化棘轮基线恢复（L15512-15522）
            foreach (var t in data["speciesBase"] as JArray ?? new JArray())
            {
                if (!(t is JArray row) || row.Count < 6) continue;
                int race = JInt(row[0]);
                st.SpeciesBase[race] = new JObject
                {
                    ["gene"] = new JObject { ["s"] = JNumOr(row[1], 1), ["d"] = JNumOr(row[2], 1), ["h"] = JNumOr(row[3], 1), ["r"] = JNumOr(row[4], 1) },
                    ["gen"] = JInt(row[5]),
                    ["sub"] = row[6] != null && row[6].Type == JTokenType.String && ((string)row[6]).Length > 0 ? (JToken)row[6] : null,
                    ["beh"] = row[7] != null && row[7].Type == JTokenType.String && ((string)row[7]).Length > 0
                        ? (JToken)BehSplit((string)row[7]) : null,
                };
            }

            // —— 涌现层恢复：动态种族重注册（L15523-15596）——
            st.DynRaces.Clear();
            st.DynRacesKeys.Clear();
            st.EmergentWeapons.Clear();
            st.Doctrines.Clear();
            st.Defenses.Clear();
            st.CivRaces = new List<int>(h.BaseCivRaces);
            // 注册表克隆（宿主 base 表防跨场景污染；rmods 补丁写克隆）
            foreach (var kv in h.Races) st.RacesOut[int.Parse(kv.Key)] = JClone(kv.Value);
            WbEmergence.InvalidateVisCache();   // 蓝本 engine.ts L15534：读档失效涌现渲染缓存（动态种重注册前全清）
            var dynSave = data["dyn"] as JObject;
            if (isV2 && dynSave != null && dynSave["races"] is JArray dynRaces)
            {
                foreach (var t in dynRaces)
                {
                    if (!(t is JArray row) || row.Count < 8) continue;
                    int id = JInt(row[0]);
                    string name = row[1]?.ToString() ?? "";
                    int parent = JInt(row[2]);
                    var pdef = RaceDefOf(st, h, parent);
                    if (pdef == null) continue; // 父种族丢失（损坏行）：丢弃该物种
                    // v3：视觉基因组恢复（旧档无 vis → visFromGene 随机分化，rng 消耗语义保真）
                    JObject vis;
                    if (row[8] is JArray visT && visT.Count >= 13) vis = TupleToVis(visT);
                    else vis = VisFromGene(pdef["vis"] != null && pdef["vis"]["root"] != null ? JNum0(pdef["vis"]["root"]) : parent, st, h);
                    var merged = (JObject)pdef.DeepClone();
                    merged["key"] = $"dyn{id}";
                    merged["name"] = name;
                    int ti = Math.Max(0, Math.Min(7, JInt(row[7])));
                    merged["dynTint"] = h.DynTints[ti];
                    merged["vis"] = vis;
                    merged["hp"] = Math.Max(1, JNumOr(row[3], JNum0(pdef["hp"])));
                    merged["dmg"] = JNumOr(row[4], JNum0(pdef["dmg"]));
                    merged["speed"] = JNumOr(row[5], JNum0(pdef["speed"]));
                    merged["repro"] = JNumOr(row[6], JNum0(pdef["repro"]));
                    // v5：造物元数据恢复（旧档缺省 → 父模板值）
                    if (JIsNum(row[12], out double ma) && ma > 0) merged["maxAge"] = JRound(ma);
                    // flags != null && isFinite → isCiv/hostile/predator 位解包覆盖
                    if (JIsNum(row[13], out double flags))
                    {
                        int f = (int)flags;
                        merged["isCiv"] = (f & 1) != 0;
                        merged["hostile"] = (f & 2) != 0;
                        merged["predator"] = (f & 4) != 0;
                    }
                    st.RacesOut[id] = merged;
                    int p2 = JIsNum(row[9], out double p2v) && p2v > 0 ? (int)p2v : 0;
                    string eco = null;
                    double ecoN = JNum0(row[10]);
                    if (ecoN == 1) eco = "pred"; else if (ecoN == 2) eco = "herb"; else if (ecoN == 3) eco = "neutral";
                    var info = new JObject { ["parent"] = parent, ["bornYear"] = 0, ["parent2"] = p2 > 0 ? (JToken)p2 : null, ["eco"] = eco, ["cap"] = null, ["uid"] = null };
                    if (JIsNum(row[11], out double capv) && capv > 0) info["cap"] = JRound(capv);
                    if (!st.DynRaces.ContainsKey(id)) st.DynRacesKeys.Add(id);
                    st.DynRaces[id] = info;
                    bool isCiv = JIsNum(row[13], out double f2) ? ((int)f2 & 1) != 0 : JTruthy(pdef["isCiv"]);
                    if (isCiv && !st.CivRaces.Contains(id)) st.CivRaces.Add(id);
                }
                foreach (var t in dynSave["weapons"] as JArray ?? new JArray())
                {
                    if (t is JObject w && JIsNum(w["id"], out _) && w["name"] != null && w["name"].Type == JTokenType.String)
                        st.EmergentWeapons[JInt(w["id"])] = JClone(w);
                }
                double dynSeq = 100;
                if (dynSave["dynSeq"] != null && dynSave["dynSeq"].Type != JTokenType.Null && JIsNum(dynSave["dynSeq"], out double ds)) dynSeq = ds;
                foreach (var id in st.DynRaces.Keys) dynSeq = Math.Max(dynSeq, id + 1);
                st.DynSeq = (int)dynSeq;
                double weapSeq = 1;
                if (dynSave["weapSeq"] != null && dynSave["weapSeq"].Type != JTokenType.Null && JIsNum(dynSave["weapSeq"], out double ws)) weapSeq = ws;
                foreach (var id in st.EmergentWeapons.Keys) weapSeq = Math.Max(weapSeq, id + 1);
                st.WeapSeq = (int)weapSeq;
                // 学说/防御恢复（武器架构 v2）
                foreach (var t in dynSave["dctr"] as JArray ?? new JArray())
                {
                    if (!(t is JArray row) || row.Count < 5) continue;
                    st.Doctrines[JInt(row[0])] = new[] { JNumOr(row[1], 0.2), JNumOr(row[2], 0.2), JNumOr(row[3], 0.2), JNumOr(row[4], 0.2) };
                }
                foreach (var t in dynSave["ddef"] as JArray ?? new JArray())
                {
                    if (!(t is JArray row) || row.Count < 4) continue;
                    st.Defenses[JInt(row[0])] = new[] { Math.Max(0, JNumOr(row[1], 0)), Math.Max(0, JNumOr(row[2], 0)), Math.Max(0, JNumOr(row[3], 0)) };
                }
                // v3：涌现特质恢复（重新注入 TRAITS 模块表——宿主全局；C# 态镜像）
                foreach (var t in dynSave["trts"] as JArray ?? new JArray())
                {
                    if (!(t is JArray row) || row.Count < 6) continue;
                    string tkey = row[0]?.ToString() ?? "";
                    var tr = new JObject
                    {
                        ["key"] = tkey,
                        ["name"] = row[1]?.ToString() ?? "",
                        ["desc"] = "涌现特质",
                        ["good"] = true,
                        ["dmgMul"] = JIsNum(row[2], out double d1) && d1 != 0 ? (JToken)(d1 / 100) : null,
                        ["hpMul"] = JIsNum(row[3], out double d2) && d2 != 0 ? (JToken)(d2 / 100) : null,
                        ["speedMul"] = JIsNum(row[4], out double d3) && d3 != 0 ? (JToken)(d3 / 100) : null,
                        ["regen"] = JIsNum(row[5], out double d4) && d4 != 0 ? (JToken)(d4 / 1000) : null,
                    };
                    st.DynTraits[tkey] = tr;
                }
                double traitSeq = 1;
                if (dynSave["traitSeq"] != null && dynSave["traitSeq"].Type != JTokenType.Null && JIsNum(dynSave["traitSeq"], out double ts)) traitSeq = ts;
                foreach (var k in st.DynTraits.Keys)
                {
                    var sk = k.Length >= 2 ? k.Substring(2) : "";
                    if (int.TryParse(sk, out int iv)) traitSeq = Math.Max(traitSeq, iv + 1);
                }
                st.TraitSeq = (int)Math.Max(1, traitSeq);
            }
            // v3：进化图谱恢复（L15597-15610）
            string[] EVO_KINDS = { "species", "weapon", "tech", "trait", "society" };
            foreach (var t in data["evo"] as JArray ?? new JArray())
            {
                if (!(t is JArray row) || row.Count < 9) continue;
                JObject meta = null;
                var mj = row[9];
                if (mj != null && mj.Type == JTokenType.String && ((string)mj).Length > 0)
                {
                    try { meta = JObject.Parse((string)mj); }
                    catch { meta = null; }
                }
                int ki = Math.Max(0, Math.Min(4, JInt(row[1])));
                var node = new JObject
                {
                    ["id"] = JInt(row[0]),
                    ["kind"] = EVO_KINDS[ki],
                    ["name"] = row[4]?.ToString() ?? "",
                    ["parent"] = JInt(row[3]) >= 0 ? (JToken)JInt(row[3]) : null,
                    ["year"] = JNum0(row[2]),
                    ["colorHex"] = row[5]?.ToString() ?? "",
                    ["detail"] = row[6]?.ToString() ?? "",
                    ["stat"] = JTruthy(row[7]) ? (JToken)(row[7]?.ToString() ?? "") : null,
                    ["alive"] = JIsNum(row[8], out double av) && av == 1,
                    ["meta"] = meta,
                };
                st.EvoNodes.Add(node);
            }
            double evoSeq = 1;
            if (data["evoSeq"] != null && data["evoSeq"].Type != JTokenType.Null && JIsNum(data["evoSeq"], out double es)) evoSeq = es;
            foreach (var n in st.EvoNodes) evoSeq = Math.Max(evoSeq, JInt(n["id"]) + 1);
            st.EvoSeq = (int)evoSeq;
            foreach (var n in st.EvoNodes)
            {
                var meta = n["meta"] as JObject;
                if (meta == null) continue;
                if ((string)n["kind"] == "species" && meta["race"] != null && meta["race"].Type != JTokenType.Null) st.EvoIndex[$"sp:{JNum0(meta["race"])}"] = JInt(n["id"]);
                if ((string)n["kind"] == "weapon" && meta["wid"] != null && meta["wid"].Type != JTokenType.Null) st.EvoIndex[$"wp:{JNum0(meta["wid"])}"] = JInt(n["id"]);
            }
            // v39：涌现社会内核——家族谱系恢复（L15611-15622）
            foreach (var t in data["fams"] as JArray ?? new JArray())
            {
                if (!(t is JArray row) || row.Count < 10) continue;
                st.Families[JInt(row[0])] = new JObject
                {
                    ["id"] = JInt(row[0]),
                    ["name"] = row[1]?.ToString() ?? "",
                    ["race"] = JInt(row[2]),
                    ["founded"] = JNum0(row[3]),
                    ["founder"] = row[4]?.ToString() ?? "",
                    ["members"] = JInt(row[5]),
                    ["heroes"] = JInt(row[6]),
                    ["kills"] = JInt(row[7]),
                    ["peak"] = JInt(row[8]),
                    ["milestones"] = JInt(row[9]),
                };
            }
            double famSeq = 1;
            if (data["familySeq"] != null && data["familySeq"].Type != JTokenType.Null && JIsNum(data["familySeq"], out double fs)) famSeq = fs;
            foreach (var id in st.Families.Keys) famSeq = Math.Max(famSeq, id + 1);
            st.FamilySeq = (int)famSeq;
            // panic 瞬态复位（peak/events/noteCd = 0——dump 常量，无恢复输入）

            // v40/v41：神谕 Agent 法则恢复（L15623-15634；seq 在 alws 数组存在时才重算，否则保持 1）
            if (data["alws"] is JArray alws)
            {
                foreach (var law in alws)
                {
                    var n = NormalizeLaw(law, h);
                    if (n != null) st.AgentLaws.Add(n);
                }
                double seq = 1;
                if (data["alwsSeq"] != null && data["alwsSeq"].Type != JTokenType.Null && JIsNum(data["alwsSeq"], out double aseq)) seq = aseq;
                st.AlwsSeq = (int)Math.Max(1, seq);
            }
            st.AlwsCounters = data["alwsCounters"] is JObject ctr ? (JObject)ctr.DeepClone() : new JObject();
            // 旧档武器迁移（L15636-15646）
            foreach (var kv in st.EmergentWeapons)
            {
                var w = kv.Value;
                if (w["pl"] != null && w["pl"].Type != JTokenType.Null && JIsNum(w["pl"], out double plv) && plv >= 0) continue;
                int dtype = (int)JClamp(JNumOr(w["dtype"], 0), 0, 4);
                int delivery = (int)JClamp(JNumOr(w["delivery"], 0), 0, 4);
                w["pl"] = dtype == 0 ? 0 : dtype == 1 ? (JNum0(w["fire"]) > 0.4 ? 2 : 1) : dtype == 2 ? 3 : dtype == 3 ? 4 : 6;
                w["dl"] = delivery;
                w["gd"] = 2;
                w["pw"] = 0;
                w["q"] = new JArray { 1, 1, 1, 1 };
                if (w["inter"] == null || w["inter"].Type == JTokenType.Null) w["inter"] = 0;
            }

            // —— 自然引擎恢复（L15647-15708）——
            st.Nature.PlateEpoch = 0;
            var natSave = data["nat"] as JObject;
            if (isV2 && natSave != null)
            {
                var pcxT = natSave["pcx"]; var pcyT = natSave["pcy"];
                if (pcxT is JArray pcx && pcyT is JArray pcy && pcx.Count == h.PlateN && pcy.Count == h.PlateN)
                {
                    // 钳制面预写（宿主 initPlates 后 + recomputePlates 钩子会覆写——对账面 = 本钳制值）
                    st.Nature.PlateCx = new double[pcx.Count];
                    st.Nature.PlateCy = new double[pcy.Count];
                    for (int p = 0; p < pcx.Count; p++)
                    {
                        st.Nature.PlateCx[p] = JClamp(JNum0(pcx[p]), 4, 256 - 4);
                        st.Nature.PlateCy[p] = JClamp(JNum0(pcy[p]), 4, 160 - 4);
                    }
                    // 宿主事件：recomputePlates()（NatureSim 域——不进对账面）
                }
                st.Nature.PlateEpoch = JInt(natSave["pe"]);
                if (natSave["hot"] is JArray hot && hot.Count > 0)
                {
                    foreach (var t in hot)
                    {
                        if (!(t is JArray r) || r.Count < 3) continue;
                        st.Nature.Hotspots.Add(new[] { JClamp(JInt(r[0]), 4, 256 - 5), JClamp(JInt(r[1]), 4, 160 - 5), JClamp(JNumOr(r[2], 0), 0, 3) });
                    }
                }
                if (natSave["stress"] is JArray stress)
                    foreach (var t in stress)
                        if (t is JArray r && r.Count >= 2 && JIsNum(r[0], out double si) && si >= 0 && si < WH)
                            st.Nature.Stress.Add(new[] { si, JNumOr(r[1], 0) / 8 });
                st.Nature.Ash = JClamp(JNumOr(natSave["ash"], 0), 0, 1);
                if (natSave["ashF"] is JArray ashF && ashF.Count > 0)
                {
                    foreach (var t in ashF)
                        if (t is JArray r && r.Count >= 2 && JIsNum(r[0], out double ci) && ci >= 0 && ci < h.AshCells)
                            st.Nature.AshF.Add(new[] { ci, JClamp(JNumOr(r[1], 0) / 200, 0, 1) });
                }
                else
                {
                    st.Nature.AshFFilled = true; // 旧档只有全局标量 → 均匀播撒兼容（宿主 fill(ash)）
                }
                st.Nature.SeasonOffset = JInt(natSave["seasonOffset"]);
                if (natSave["counters"] is JArray cts && cts.Count >= 10)
                {
                    for (int i = 0; i < 10; i++) st.Nature.Counters[i] = JInt(cts[i]);
                }
                // stormSeq spread 含全部行（len<9 损坏行也计入 id+1——L15690 先于恢复循环的独立表达式）
                double stormSeq = 1;
                if (natSave["stormSeq"] != null && natSave["stormSeq"].Type != JTokenType.Null) stormSeq = JInt(natSave["stormSeq"]);
                if (natSave["storms"] is JArray stormsAll)
                    foreach (var t in stormsAll)
                        if (t is JArray rr && rr.Count >= 1) stormSeq = Math.Max(stormSeq, JInt(rr[0]) + 1);
                if (natSave["storms"] is JArray storms)
                {
                    foreach (var t in storms)
                    {
                        if (!(t is JArray row) || row.Count < 9) continue;
                        int sid = JInt(row[0]);
                        st.Nature.Storms.Add(new JObject
                        {
                            ["id"] = sid,
                            ["x"] = JClamp(JNumOr(row[1], 4), 3, 256 - 4),
                            ["y"] = JClamp(JNumOr(row[2], 4), 3, 160 - 4),
                            ["strength"] = JClamp(JNumOr(row[3], 0.4), 0.1, 1.6),
                            ["ttl"] = Math.Max(0, JInt(row[4])),
                            ["seed"] = JInt(row[5]),
                            ["kind"] = JInt(row[6]) == 1 ? "blizzard" : "cyclone",
                            ["name"] = StormNameAt(sid, h),
                            ["landed"] = JTruthy(row[8]),
                        });
                    }
                }
                st.Nature.StormSeq = (int)Math.Max(1, stormSeq);
            }
            st.Nature.LastSeason = -1;
            // killCredit null / speciesHist 清空——宿主态
            // —— 终极世界大战恢复（L15711-15746）——
            var wwSave = data["worldWar"] as JObject;
            if (wwSave != null && ((string)wwSave["phase"]) == "running" || wwSave != null && ((string)wwSave["phase"]) == "ended")
            {
                var ww = new JObject { ["phase"] = (string)wwSave["phase"] };
                ww["startTick"] = wwSave["startTick"] != null && wwSave["startTick"].Type != JTokenType.Null ? (JToken)JInt(wwSave["startTick"]) : 0;
                ww["startYear"] = wwSave["startYear"] != null && wwSave["startYear"].Type != JTokenType.Null ? (JToken)JInt(wwSave["startYear"]) : 0;
                ww["endTick"] = wwSave["endTick"] != null && wwSave["endTick"].Type != JTokenType.Null ? (JToken)JInt(wwSave["endTick"]) : 0;
                var bell = new JArray();
                if (wwSave["belligerents"] is JArray bl)
                    // 蓝本 filter(typeof number) 只滤类型不截断——3.5 保 Float（save3 W3-stormbliz 黄金 3.5 + save2 R-legacy 黄金 [0,1,3.5] 双证，2026-10-29 修正）
                    foreach (var t in bl) if (JIsNum(t, out _)) bell.Add(t);
                ww["belligerents"] = bell;
                ww["pop0"] = wwSave["pop0"] is JObject p0 ? p0.DeepClone() : new JObject();
                ww["kills"] = wwSave["kills"] != null && wwSave["kills"].Type != JTokenType.Null ? (JToken)JInt(wwSave["kills"]) : 0;
                var fallen = new JArray();
                if (wwSave["fallen"] is JArray fl)
                    foreach (var t in fl) if (t is JObject f && JIsNum(f["id"], out _)) fallen.Add(f.DeepClone());
                ww["fallen"] = fallen;
                foreach (var (k, dflt) in new[] { ("truces", "0"), ("nukes", "0"), ("lasers", "0"), ("drones", "0"), ("orbitals", "0"), ("plasmas", "0"), ("antimatters", "0"), ("emerged", "0") })
                    ww[k] = wwSave[k] != null && wwSave[k].Type != JTokenType.Null ? wwSave[k].DeepClone() : (JToken)dflt;
                ww["winner"] = JIsNum(wwSave["winner"], out double win) ? (JToken)(int)win : (wwSave["winner"] != null && wwSave["winner"].Type == JTokenType.Null ? (JToken)null : wwSave["winner"] != null && wwSave["winner"].Type == JTokenType.Boolean ? (JToken)wwSave["winner"] : null);
                ww["endText"] = wwSave["endText"] != null && wwSave["endText"].Type != JTokenType.Null ? wwSave["endText"].DeepClone() : "";
                st.WorldWar = ww;
            }
            else
            {
                st.WorldWar = JObject.Parse("{\"phase\":\"idle\",\"startTick\":0,\"startYear\":0,\"endTick\":0,\"belligerents\":[],\"pop0\":{},\"kills\":0,\"fallen\":[],\"truces\":0,\"nukes\":0,\"lasers\":0,\"drones\":0,\"orbitals\":0,\"plasmas\":0,\"antimatters\":0,\"emerged\":0,\"winner\":null,\"endText\":\"\"}");
            }
            if (data["wwTruce"] is JArray truce)
                foreach (var t in truce)
                    if (t is JArray r && r.Count >= 2 && r[0] != null && r[0].Type == JTokenType.String && JIsNum(r[1], out double tv))
                        st.WwTruce[(string)r[0]] = tv;
            st.WwNuke = -600; st.WwAnti = -1200; st.WwFrenzy = -1;

            // —— 军团成员 id 与单位表对账（L15747-15760；倒序遍历语义保真）——
            for (int ai = st.Armies.Count - 1; ai >= 0; ai--)
            {
                var a = st.Armies[ai];
                var members = (JArray)a["members"];
                for (int k = members.Count - 1; k >= 0; k--)
                {
                    int mid = JInt(members[k]);
                    if (!st.UnitById.TryGetValue(mid, out var u) || JTruthy(u["dead"]) || JInt(u["civ"]) != JInt(a["civ"]))
                        members.RemoveAt(k);
                    else u["army"] = JInt(a["id"]);
                }
                if (members.Count < 4) st.Armies.RemoveAt(ai);
            }
            st.LastClash = 0; st.LastReinforce = 0; st.LastVolley = 0;

            // —— v4 联盟系统恢复（L15762-15804）——
            st.AllianceSeq = 1;
            if (data["als"] is JArray als)
            {
                foreach (var t in als)
                {
                    if (!(t is JArray row) || row.Count < 9) continue;
                    int alId = JInt(row[0]);
                    var members = new JArray();
                    var parts = (row[2]?.ToString() ?? "").Split(',');
                    foreach (var p in parts)
                    {
                        if (double.TryParse(p.Trim(), out double mv) && !double.IsNaN(mv) && mv >= 0 && mv < st.Civs.Count)
                            members.Add((int)mv);
                    }
                    if (members.Count < 2) continue; // 成员不足的联盟无意义
                    double cohesion = JClamp(JNumOr(row[4], 55), 0, 100);
                    // ALLIANCE_COLORS[(id|0) % len] —— JS 负索引 → undefined（域内 id 恒正，负索引防御性保留 null）
                    int colorIdx = alId % h.AllianceColors.Length;
                    string colorHex = row[8] != null && row[8].Type == JTokenType.String && ((string)row[8]).StartsWith("#")
                        ? (string)row[8] : (colorIdx >= 0 ? h.AllianceColors[colorIdx] : null);
                    var al = new JObject
                    {
                        ["id"] = alId,
                        ["name"] = row[1] != null && ((string)row[1]).Length > 0 ? (JToken)row[1] : $"同盟{alId}",
                        ["members"] = members,
                        ["leader"] = Math.Max(0, JInt(row[3])),
                        ["cohesion"] = cohesion,
                        ["formedTick"] = JInt(row[5]),
                        ["formedYear"] = JInt(row[6]),
                        ["warsTogether"] = JInt(row[7]),
                        ["colorHex"] = colorHex,
                        ["bonded"] = JTruthy(row[9]),
                    };
                    st.Alliances.Add(al);
                    foreach (var m in members) st.AllianceOf[(int)m] = alId;
                    st.AllianceSeq = (int)Math.Max(st.AllianceSeq, alId + 1);
                }
            }
            if (JIsNum(data["allianceSeq"], out double alseq)) st.AllianceSeq = (int)Math.Max(st.AllianceSeq, (int)alseq);
            if (data["rrel"] is JArray rrel)
                foreach (var t in rrel)
                    if (t is JArray r && r.Count >= 2 && r[0] != null && r[0].Type == JTokenType.String && JIsNum(r[1], out double rv))
                        st.RaceRel[(string)r[0]] = JClamp(rv, -80, 80);

            // v5：造物工坊恢复（L15805-15864）——图鉴注册重链 + 内置覆写重放 + 图鉴物种属性同步
            if (data["creg"] is JArray creg)
                foreach (var t in creg)
                    if (t is JArray r && r.Count >= 2 && r[0] != null && r[0].Type == JTokenType.String && JIsNum(r[1], out double ridv)
                        && st.RacesOut.TryGetValue((int)ridv, out _))
                    {
                        string uid = (string)r[0];
                        st.CreationRaceIds[uid] = (int)ridv;
                        if (st.DynRaces.TryGetValue((int)ridv, out var info)) info["uid"] = uid;
                    }
            if (data["rmods"] is JArray rmods)
            {
                foreach (var t in rmods)
                {
                    if (!(t is JArray r) || r.Count < 2) continue;
                    if (!JIsNum(r[0], out double ridD) || ridD < 0 || ridD >= 100 || r[1] == null || r[1].Type != JTokenType.String) continue;
                    int rid = (int)ridD;
                    if (!st.RacesOut.TryGetValue(rid, out var d)) continue;
                    JObject p;
                    try { p = JObject.Parse((string)r[1]); }
                    catch { continue; /* 坏 patch 行：跳过（不阻断读档） */ }
                    if (!st.RaceOrigKeys.Contains(rid)) st.RaceOrigKeys.Add(rid);
                    if (p["name"] != null && p["name"].Type == JTokenType.String && ((string)p["name"]).Length > 0)
                        d["name"] = ((string)p["name"]).Substring(0, Math.Min(8, ((string)p["name"]).Length));
                    if (JIsNum(p["hp"], out double ph)) d["hp"] = JClamp(JRound(ph), 1, 99999);
                    if (JIsNum(p["dmg"], out double pd)) d["dmg"] = JClamp(pd, 0, 500);
                    if (JIsNum(p["speed"], out double ps)) d["speed"] = JClamp(ps, 0.005, 0.3);
                    if (JIsNum(p["repro"], out double pr)) d["repro"] = JClamp(pr, 0, 0.02);
                    if (JIsNum(p["maxAge"], out double pm)) d["maxAge"] = JClamp(JRound(pm), 1, 9999);
                    if (p["isCiv"] != null && p["isCiv"].Type == JTokenType.Boolean) d["isCiv"] = (bool)p["isCiv"];
                    if (p["hostile"] != null && p["hostile"].Type == JTokenType.Boolean) d["hostile"] = (bool)p["hostile"];
                    st.RaceMods[rid] = (string)r[1];
                }
                // if (rmods.Count > 0) { WB.invalidateRaceFlags(); enemyLut.clear(); } —— 宿主钩子（no-op）
            }
            if (data["imods"] is JArray imods)
            {
                foreach (var t in imods)
                {
                    if (!(t is JArray r) || r.Count < 2) continue;
                    if (r[0] == null || r[0].Type != JTokenType.String || r[1] == null || r[1].Type != JTokenType.String) continue;
                    string kind = (string)r[0];
                    if (!h.ItemDefs.TryGetValue(kind, out var d)) continue;
                    JObject p;
                    try { p = JObject.Parse((string)r[1]); }
                    catch { continue; /* 坏 patch 行：跳过 */ }
                    if (!st.ItemOrigKeys.Contains(kind)) st.ItemOrigKeys.Add(kind);
                    if (p["name"] != null && p["name"].Type == JTokenType.String && ((string)p["name"]).Length > 0)
                        d["name"] = ((string)p["name"]).Substring(0, Math.Min(8, ((string)p["name"]).Length));
                    if (JIsNum(p["rarity"], out double prr)) d["rarity"] = JClamp(JRound(prr), 0, 4);
                    if (p["desc"] != null && p["desc"].Type == JTokenType.String && ((string)p["desc"]).Length > 0)
                        d["desc"] = ((string)p["desc"]).Substring(0, Math.Min(40, ((string)p["desc"]).Length));
                    foreach (var k in new[] { "dmg", "hp", "speedMul", "regen", "armor", "crit", "lifesteal", "thorns", "ranged" })
                    {
                        if (JIsNum(p[k], out double v) && !double.IsNaN(v)) d[k] = v;
                    }
                    st.ItemMods[kind] = (string)r[1];
                }
            }
            // 曾繁盛种族重建（L15865-15869；isCiv 读补丁后注册表——顺序保真）
            foreach (var u in st.Units)
            {
                if (JTruthy(u["dead"])) continue;
                var rd = RaceDefOf(st, h, JInt(u["race"]));
                if (rd == null || !JTruthy(rd["isCiv"])) continue;
                if (!st.RaceThrived.Contains(JInt(u["race"]))) st.RaceThrived.Add(JInt(u["race"]));
            }
            // 科技回溯基准初始化（L15870-15881）：techModsOf 宿主查表
            foreach (var u in st.Units)
            {
                int civ = JInt(u["civ"]);
                double[] tm = null;
                foreach (var row in h.TechMods) if ((int)row[0] == civ) { tm = row; break; }
                if (civ >= 0 && civ < st.Civs.Count && JTruthy(st.Civs[civ]["alive"]) && tm != null)
                {
                    u["tDmg"] = tm[1];
                    u["tHp"] = tm[2];
                }
                else
                {
                    u["tDmg"] = 1;
                    u["tHp"] = 1;
                }
            }
            // 清空瞬态状态（L15883-15888）
            st.Effects = 0; st.Shake = 0; st.Acc = 0;
            st.FollowId = null; st.SelectedId = null;
            // 宿主接力（canvas 重绘/climate 重算/rebuildWaterTiers/WorldSim/dirty 全量/flushDirty/flushProps/
            // rebuildAmbLists/statsTick）——不进对账面
            return st;
        }

        /// <summary>pairKey（L34）：a < b ? 'a-b' : 'b-a'（数值域内 int 直比）</summary>
        private static string PairKey(double a, double b) => a < b ? $"{(int)a}-{(int)b}" : $"{(int)b}-{(int)a}";

        /// <summary>beh 串拆分（split(',').filter(Boolean)）</summary>
        private static JArray BehSplit(string s)
        {
            var outList = new JArray();
            foreach (var p in s.Split(',')) if (p.Length > 0) outList.Add(p);
            return outList;
        }

        /// <summary>STORM_NAME_AT（nature.ts L27）：names[min(len-1, max(0,id) % len)]</summary>
        public static string StormNameAt(int id, WbSaveHost h)
        {
            var names = h.StormNames;
            if (names.Length == 0) return null;
            return names[Math.Min(names.Length - 1, Math.Max(0, id) % names.Length)];
        }

        /// <summary>tupleToVis（emergence.ts L91）：13 元组 → 视觉基因组</summary>
        public static JObject TupleToVis(JArray t)
        {
            return new JObject
            {
                ["root"] = JInt(t[0]), ["hue"] = JInt(t[1]),
                ["lum"] = JNum0(t[2]) / 100, ["size"] = JNum0(t[3]) / 100, ["bulk"] = JNum0(t[4]) / 100,
                ["horns"] = JInt(t[5]), ["spikes"] = JInt(t[6]), ["mane"] = JInt(t[7]), ["tail"] = JInt(t[8]),
                ["ears"] = JInt(t[9]), ["glow"] = JInt(t[10]), ["pattern"] = JInt(t[11]), ["crest"] = JInt(t[12]),
            };
        }

        /// <summary>visToTuple（emergence.ts L88）：序列化 13 元组（Math.round 半上）</summary>
        public static JArray VisToTuple(JObject v)
        {
            // JS number 单域：Math.round 产出整值 f64，JSON.stringify 写整数形（88 非 88.0）——
            // JToken 整值发射器保证 DeepEquals 逐位（2026-10-29 修复：Float/Integer 表示分歧）
            JValue JIntLike(double x) => double.IsNaN(x) || double.IsInfinity(x) || Math.Floor(x) != x || Math.Abs(x) >= 9.007199254740992E15
                ? new JValue(x) : new JValue((long)x);
            return new JArray
            {
                JIntLike(JNum0(v["root"])), JIntLike(JNum0(v["hue"])), JIntLike(JRound(JNum0(v["lum"]) * 100)), JIntLike(JRound(JNum0(v["size"]) * 100)),
                JIntLike(JRound(JNum0(v["bulk"]) * 100)), JIntLike(JNum0(v["horns"])), JIntLike(JNum0(v["spikes"])), JIntLike(JNum0(v["mane"])),
                JIntLike(JNum0(v["tail"])), JIntLike(JNum0(v["ears"])), JIntLike(JNum0(v["glow"])), JIntLike(JNum0(v["pattern"])), JIntLike(JNum0(v["crest"])),
            };
        }

        /// <summary>visFromGene（emergence.ts L46）：基因漂移推导初始视觉——rng 消耗序保真（含短路）</summary>
        public static JObject VisFromGene(double root, WbSaveState st, WbSaveHost h)
        {
            double R() => WbRng.Mulberry32Next(ref st.RngA);
            double gd = 1, gh = 1; // 调用点固定 {s:1, d:1, h:1, r:1}
            var vis = new JObject { ["root"] = root };
            vis["hue"] = JRound((R() - 0.5) * 20 + (gd - 1) * 14);
            vis["lum"] = JRound((0.92 + R() * 0.12 + (gh - 1) * 0.08) * 100) / 100;
            vis["size"] = JRound((0.9 + R() * 0.2 + (gh - 1) * 0.3) * 100) / 100;
            vis["bulk"] = JClamp(0.3 + (gh - 1) * 0.8 + (gd - 1) * 0.3, 0, 1);
            vis["horns"] = gd > 1.25 ? (R() < 0.6 ? 1 : 2) : (R() < 0.2 ? 1 : 0);
            vis["spikes"] = gd > 1.35 && R() < 0.5 ? 1 : 0;
            vis["mane"] = gh > 1.2 && R() < 0.4 ? 1 : 0;
            vis["tail"] = JRound(R() * 2);
            vis["ears"] = R() < 0.45 ? 1 : (R() < 0.5 ? 2 : 0);
            vis["glow"] = R() < 0.12 ? 1 : 0;
            vis["pattern"] = R() < 0.3 ? 1 : (R() < 0.35 ? 2 : 0);
            vis["crest"] = R() < 0.15 ? 1 : 0;
            return vis;
        }

        /// <summary>normalizeTrigger（agentLaws.ts L149）——condition 分支 cond 原样透传（validateCond = M-O 神谕域宿主侧协议）</summary>
        /// <returns> MechTrigger JObject 或 null（触发器损坏 → 调用方退化默认 cron）</returns>
        public static object NormalizeTrigger(JObject o, WbSaveHost h)
        {
            o = o ?? new JObject();
            string kindRaw = o["kind"] == null || o["kind"].Type == JTokenType.Null ? "" : (string)o["kind"];
            string kind;
            if (kindRaw == "cron" || kindRaw == "event" || kindRaw == "condition") kind = kindRaw;
            else if (kindRaw == "") kind = o["event"] != null && o["event"].Type != JTokenType.Null ? "event" : (o["cond"] != null && o["cond"].Type != JTokenType.Null ? "condition" : "cron");
            else return $"未知触发器类型 {kindRaw}（可用：cron/event/condition）";
            double chance = o["chance"] == null || o["chance"].Type == JTokenType.Null ? 1 : JClamp(JIsNum(o["chance"], out double chv) && !double.IsNaN(chv) ? chv : 1, 0.01, 1);
            object season = o["season"] == null || o["season"].Type == JTokenType.Null ? null : (object)(int)JClamp(JRound(JNumOr(o["season"], 0)), 0, 3);
            double everyYears = o["everyYears"] == null || o["everyYears"].Type == JTokenType.Null
                ? (kind == "condition" ? 1 : 10)
                : Math.Max(1, Math.Min(100, JRound(JNumOr(o["everyYears"], 1))));
            if (kind == "event")
            {
                string ev = o["event"] != null ? o["event"].ToString() : "";
                if (!h.EventKinds.Contains(ev)) return $"未知事件类型 {ev}（可用 WorldEventKind，如 fall/war/plague/meteor/oracle…）";
                double cd = o["eventCooldownYears"] == null || o["eventCooldownYears"].Type == JTokenType.Null ? 1 : Math.Max(1, Math.Min(100, JRound(JNumOr(o["eventCooldownYears"], 1))));
                return new JObject { ["kind"] = "event", ["chance"] = chance, ["event"] = ev, ["eventCooldownYears"] = cd };
            }
            if (kind == "condition")
            {
                if (o["cond"] == null || o["cond"].Type == JTokenType.Null) return "condition 触发器必须带 cond 条件树";
                // validateCond 宿主侧（协议注记）；已归一化档案行透传
                return new JObject { ["kind"] = "condition", ["everyYears"] = everyYears, ["chance"] = chance, ["season"] = season == null ? null : (JToken)(int)season, ["cond"] = o["cond"].DeepClone() };
            }
            var cron = new JObject { ["kind"] = "cron", ["everyYears"] = everyYears, ["chance"] = chance };
            cron["season"] = season == null ? null : (JToken)(int)season;
            return cron;
        }

        /// <summary>normalizeLaw（agentLaws.ts L178）：v1 触发器补 kind、缺省补默认、未知动作剔除；彻底损坏返回 null</summary>
        public static JObject NormalizeLaw(JToken raw, WbSaveHost h)
        {
            if (raw == null || raw.Type != JTokenType.Object) return null;
            var o = (JObject)raw;
            if (o["id"] == null || o["id"].Type != JTokenType.String || ((string)o["id"]).Length == 0) return null;
            if (!(o["actions"] is JArray actionsRaw)) return null;
            var actions = new JArray();
            foreach (var a in actionsRaw)
            {
                if (a == null || a.Type != JTokenType.Object) continue;
                var act = (JObject)a;
                var kindTok = act["kind"];
                string kind = kindTok == null ? "" : kindTok.ToString();
                if (!h.ActionKinds.Contains(kind)) continue; // 未知/损坏动作剔除
                actions.Add(act.DeepClone());
            }
            if (actions.Count == 0) return null;
            var trRaw = NormalizeTrigger(o["trigger"] as JObject, h);
            JObject trigger;
            if (trRaw is string errMsg) trigger = JObject.Parse("{\"kind\":\"cron\",\"everyYears\":10,\"chance\":1,\"season\":null}"); // 触发器损坏：退化为安全默认
            else trigger = (JObject)trRaw;
            double numOr(JToken t, double d) => JIsNum(t, out double v) && !double.IsNaN(v) ? v : d;
            string name = o["name"] != null && o["name"].Type == JTokenType.String ? ((string)o["name"]).Trim() : "";
            string desc = o["desc"] != null && o["desc"].Type == JTokenType.String ? ((string)o["desc"]).Trim() : "";
            var dur = o["durationYears"] == null || o["durationYears"].Type == JTokenType.Null
                ? (JToken)null : (JToken)JClamp(JRound(numOr(o["durationYears"], 100)), 1, 1000);
            return new JObject
            {
                ["id"] = (string)o["id"],
                ["name"] = name.Length > 0 ? name.Substring(0, Math.Min(24, name.Length)) : "无名法则",
                ["desc"] = desc.Length > 0 ? desc.Substring(0, Math.Min(120, desc.Length)) : "（无描述）",
                ["enabled"] = !(o["enabled"] != null && o["enabled"].Type == JTokenType.Boolean && !(bool)o["enabled"]),
                ["createdYear"] = JRound(numOr(o["createdYear"], 0)),
                ["durationYears"] = dur,
                ["trigger"] = trigger,
                ["actions"] = actions,
                ["fired"] = Math.Max(0, JRound(numOr(o["fired"], 0))),
                ["lastYear"] = JRound(numOr(o["lastYear"], 0)),
                ["revert"] = new JObject(), // 改前值账本不序列化（读档即回默认基调）
            };
        }

        /// <summary>normalizeWarInfo（L7180）：casusText/aggressor 兜底 + lastActiveTick = 恢复后 tickCount</summary>
        public static JObject NormalizeWarInfo(JObject w, WbSaveState st, WbSaveHost h)
        {
            double aIdx = JNumNullish(w["a"], -1), bIdx = JNumNullish(w["b"], -1); // ?? 语义（a=0 合法，|| 语义误判缺失→civA null→casusText 脱靶）
            var civA = aIdx >= 0 && aIdx < st.Civs.Count ? st.Civs[(int)aIdx] : null;
            var civB = bIdx >= 0 && bIdx < st.Civs.Count ? st.Civs[(int)bIdx] : null;
            string reason = w["reason"] != null && w["reason"].Type == JTokenType.String ? (string)w["reason"] : (JTruthy(w["total"]) ? "annex" : "border");
            double goal = JNumNullish(w["goal"], 0);
            bool bothAlive = civA != null && JTruthy(civA["alive"]) && civB != null && JTruthy(civB["alive"]);
            string reasonText;
            if (w["reasonText"] != null && w["reasonText"].Type != JTokenType.Null) reasonText = (string)w["reasonText"];
            else if (bothAlive)
            {
                reasonText = null;
                foreach (var row in h.CasusTable)
                {
                    if ((int)row[0] == (int)aIdx && (int)row[1] == (int)bIdx && (string)row[2] == reason && Math.Abs(JNum0(row[3]) - goal) < 1e-12)
                    { reasonText = (string)row[4]; break; }
                }
                reasonText ??= ""; // 查表脱靶 → 宿主事件补填（WbCivSim.CasusText 域）
            }
            else reasonText = "";
            double aggressor;
            if (w["aggressor"] != null && w["aggressor"].Type != JTokenType.Null) aggressor = JNum0(w["aggressor"]);
            else if (bothAlive) aggressor = JNum0(civA["pop"]) >= JNum0(civB["pop"]) ? aIdx : bIdx;
            else aggressor = w["a"] != null ? aIdx : 0;
            return new JObject
            {
                ["key"] = w["key"] != null && w["key"].Type == JTokenType.String ? (JToken)w["key"] : PairKey(w["a"] != null ? aIdx : 0, w["b"] != null ? bIdx : 1),
                ["a"] = w["a"] != null ? (JToken)(int)aIdx : 0,
                ["b"] = w["b"] != null ? (JToken)(int)bIdx : 0,
                ["startTick"] = w["startTick"] != null && w["startTick"].Type != JTokenType.Null ? w["startTick"].DeepClone() : st.TickCount,
                ["startYear"] = w["startYear"] != null && w["startYear"].Type != JTokenType.Null ? w["startYear"].DeepClone() : JFloor(st.YearF),
                ["total"] = w["total"] == null ? (JToken)false : (JToken)JTruthy(w["total"]),
                ["scoreA"] = JNumOr(w["scoreA"], 0), ["scoreB"] = JNumOr(w["scoreB"], 0),
                ["exA"] = JNumOr(w["exA"], 0), ["exB"] = JNumOr(w["exB"], 0),
                ["casA"] = JNumOr(w["casA"], 0), ["casB"] = JNumOr(w["casB"], 0),
                ["razedA"] = JNumOr(w["razedA"], 0), ["razedB"] = JNumOr(w["razedB"], 0), ["battles"] = JNumOr(w["battles"], 0),
                ["giveUpAt"] = JNumOr(w["giveUpAt"], 0),
                ["reason"] = reason,
                ["reasonText"] = reasonText,
                ["aggressor"] = aggressor,
                ["goal"] = goal,
                ["goalNow"] = JNumOr(w["goalNow"], 0),
                ["occA"] = JNumOr(w["occA"], 0), ["occB"] = JNumOr(w["occB"], 0),
                ["popA0"] = w["popA0"] != null && w["popA0"].Type != JTokenType.Null ? w["popA0"].DeepClone() : (civA != null ? civA["pop"].DeepClone() : 0),
                ["popB0"] = w["popB0"] != null && w["popB0"].Type != JTokenType.Null ? w["popB0"].DeepClone() : (civB != null ? civB["pop"].DeepClone() : 0),
                ["lastActiveTick"] = st.TickCount,
            };
        }

        // ============================================================
        // serialize 写方向首段：unitsToRows（engine.ts L128-139）
        // [header 42 键名, ...行]；值 undefined（JObject 键缺失）→ null；其余原样
        // （serialize 全档组装 = M-U6c 域：本切片交付恢复链 + 本编码首段）
        // ============================================================
        public static readonly string[] UnitFieldOrder = {
            "id", "race", "civ", "x", "y", "tx", "ty", "hp", "maxHp", "dmg", "speed", "age", "maxAge", "kills", "cd",
            "trait", "job", "king", "infected", "flip", "name", "hurt", "breath", "parity", "dead", "boat", "boatTTL",
            "caravan", "wep", "arm", "hlm", "shd", "bts", "rng", "amu", "army", "gene", "food", "fam", "fgn", "gIds", "gVal",
        };

        public static JArray UnitsToRows(List<JObject> units)
        {
            var rows = new JArray();
            var header = new JArray();
            foreach (var f in UnitFieldOrder) header.Add(f);
            rows.Add(header);
            foreach (var u in units)
            {
                var row = new JArray();
                foreach (var f in UnitFieldOrder)
                {
                    var v = u[f];
                    if (v == null || v.Type == JTokenType.Null || v.Type == JTokenType.Undefined) row.Add(null);
                    else row.Add(v.Type == JTokenType.Integer ? (JToken)(int)v : v.DeepClone());
                }
                rows.Add(row);
            }
            return rows;
        }

        // __PART2B__
    }
}
