// WbSave3.cs — M-U6c serialize 全档组装（engine.ts serialize L15187-15340 机械翻译）
// 输入三参：st = ApplySave 状态袋（M-U6b 产出）+ h = 查表上提包 + data = ApplySave 原输入档
// 序敏感容器（rel/warShame/wwTruce/warData/speciesBase/dyn.*/emT/emI/fams/rrel/rmods/imods/creg）
//   按 data 输入行序遍历、值从 st 取 —— JS Map「entries() = 首插序；set 已有键保序换值」语义的 C# 等价实现
//   （round-trip 无 tick：恢复序 = 输入行序，data 行序即 Map 序的确定性真相源）
// 宿主钩子（不进对账面的域）：pcx/pcy = h.HookPlateCx/Cy（recomputePlates 后真相）；hot = h.HotspotsHost ?? st 自算；
//   stress 扫描序 = h.BoundaryStress（gen 端证明 nature.boundary Set 天然升序，sort 无损）
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace PixelWorldBox.Wb
{
    public static class WbSave3
    {
        // —— JS 数值语义助手（WbSave2 private 同款副本，M-U6a 协议）——
        private static bool JIsNum(JToken t, out double v)
        {
            v = 0;
            if (t == null) return false;
            if (t.Type == JTokenType.Integer) { v = (int)t; return true; }
            if (t.Type == JTokenType.Float) { v = (double)t; return true; }
            return false;
        }
        private static double JNumOr(JToken t, double d)
        {
            if (!JIsNum(t, out double v)) return d;
            return v != 0 ? v : d;
        }
        private static double JNum0(JToken t) => JNumOr(t, 0);
        private static int JInt(JToken t) { JIsNum(t, out double v); return (int)v; }
        /// <summary>JS Math.round 半上（M-U5a 全域等价已验证：Floor(v+0.5) 含 -0.5→0/-1.5→-1）</summary>
        private static double JRound(double v) => Math.Floor(v + 0.5);
        private static double JClamp(double v, double lo, double hi) => Math.Max(lo, Math.Min(hi, v));
        private static bool JTruthy(JToken t) =>
            t != null && t.Type != JTokenType.Null && t.Type != JTokenType.Undefined &&
            !(t.Type == JTokenType.Boolean && !(bool)t);
        private static JObject JClone(JToken t) => t == null ? null : (JObject)t.DeepClone();
        private static JArray JArrClone(JToken t) => t == null ? null : (JArray)t.DeepClone();

        // 蓝本域常量（engine.ts L681 ctor cam / nature AW×AH）
        private const int ENG_W = 256, ENG_H = 160;

        /// <summary>序敏感容器行序重演：按 data 输入行序遍历键，值从 getter 取（st 无键 = 恢复被过滤 → 输出跳过）</summary>
        private static JArray RowsByKey(JArray input, Func<string, JToken> getter)
        {
            var arr = new JArray();
            if (input == null) return arr;
            var seen = new HashSet<string>();
            foreach (var t in input)
            {
                if (!(t is JArray row) || row.Count < 1) continue;
                string k = row[0] == null ? null : row[0].ToString();
                if (k == null || !seen.Add(k)) continue;   // JS Map 首插序 + 唯一键
                var v = getter(k);
                if (v == null) continue;                   // 恢复被过滤的键 serialize 不输出（黄金域内不触发，防御）
                arr.Add(new JArray { k, v });
            }
            return arr;
        }

        /// <summary>序敏感数字键容器（speciesBase/dctr/ddef 行序重演）</summary>
        private static JArray RowsByNumKey(JArray input, Func<int, JToken> getter)
        {
            var arr = new JArray();
            if (input == null) return arr;
            var seen = new HashSet<int>();
            foreach (var t in input)
            {
                if (!(t is JArray row) || row.Count < 1) continue;
                if (!JIsNum(row[0], out double kd)) continue;
                int k = (int)kd;
                if (!seen.Add(k)) continue;
                var v = getter(k);
                if (v == null) continue;
                arr.Add(v);
            }
            return arr;
        }

        /// <summary>owner Int16Array → u16 小端字节视图（蓝本 new Uint8Array(this.owner.buffer, ...)）</summary>
        private static byte[] OwnerBytes(short[] owner)
        {
            var b = new byte[owner.Length * 2];
            for (int i = 0; i < owner.Length; i++)
            {
                b[i * 2] = (byte)(owner[i] & 0xFF);
                b[i * 2 + 1] = (byte)((owner[i] >> 8) & 0xFF);
            }
            return b;
        }

        private static string PairKey(double a, double b)
        {
            int ia = (int)a, ib = (int)b;
            return ia < ib ? $"{ia}|{ib}" : $"{ib}|{ia}";
        }

        // ============================================================
        // serialize（engine.ts L15187-15340 机械翻译）—— WbSaveState → SaveDataV2
        // ============================================================
        public static JObject Serialize(WbSaveState st, WbSaveHost h, JObject data)
        {
            var o = new JObject();
            // —— 标量组（蓝本 v/savedAt/source/seed/tickCount/yearF/unitSeq/civSeq/toastSeq/victoryCiv/multiCivSeen）——
            o["v"] = 2;
            o["savedAt"] = 0;                    // 蓝本 Date.now() 非确定 —— 黄金协议剥离（gen 端 save2.savedAt = 0）
            o["source"] = "manual";              // 蓝本 serialize('manual') 入参（黄金协议固定）
            o["seed"] = st.Seed;
            o["tickCount"] = st.TickCount;
            o["yearF"] = st.YearF;
            o["unitSeq"] = st.UnitSeq;
            o["civSeq"] = st.CivSeq;
            o["toastSeq"] = st.ToastSeq;
            o["victoryCiv"] = st.VictoryCiv == null ? JValue.CreateNull() : new JValue(Convert.ToInt32(st.VictoryCiv));
            o["multiCivSeen"] = st.MultiCivSeen;
            // —— RLE 编码组（蓝本 rleEncode 链；v2 不存 variant——读档 hash2 确定性重算）——
            o["terrain"] = WbSave.RleEncode(st.Terrain);
            o["variant"] = "";
            o["owner"] = WbSave.RleEncode(OwnerBytes(st.Owner));
            o["building"] = WbSave.RleEncode(st.Building);
            o["fire"] = WbSave.RleEncode(st.Fire);
            o["radiate"] = WbSave.RleEncode(st.Radiate);
            // —— Map/Set entries 克隆组（List 保序容器直出）——
            o["regrow"] = JArrClone2(st.Regrow);
            o["radDue"] = JArrClone2(st.RadDue);
            // —— 列式单位行（M-U6b UnitsToRows 写向首段）——
            o["u"] = WbSave2.UnitsToRows(st.Units);
            o["units"] = new JArray();           // 列式格式生效时恒空
            // —— 文明/建筑（蓝本浅拷贝 + tiles/frontier/color 数组拷贝 ≡ JSON 层深克隆）——
            var civs = new JArray();
            foreach (var c in st.Civs) civs.Add(JClone(c));
            o["civs"] = civs;
            var bld = new JArray();
            foreach (var b in st.Buildings) bld.Add(JClone(b));
            o["buildings"] = bld;
            // —— rel（data 行序）/ met（Set 迭代序 = 恢复序）——
            o["rel"] = RowsByKey(data["rel"] as JArray, k => st.Rel.TryGetValue(k, out double rv) ? new JValue(rv) : null);
            var met = new JArray();
            foreach (var m in st.Met) met.Add(m);
            o["met"] = met;
            // —— cam（恢复命中 = 钳制值；未命中 = ctor 默认 {W/2, H/2, 4.5} 蓝本 L681）——
            if (st.CamApplied) o["cam"] = new JObject { ["x"] = st.CamX, ["y"] = st.CamY, ["zoom"] = st.CamZoom };
            else o["cam"] = new JObject { ["x"] = (double)(ENG_W / 2), ["y"] = (double)(ENG_H / 2), ["zoom"] = 4.5 };
            // —— 事件/法则/物品 ——
            var evs = new JArray();
            foreach (var e in st.Events) evs.Add(JClone(e));
            o["events"] = evs;
            o["eventSeq"] = st.EventSeq;
            o["river"] = WbSave.RleEncode(st.RiverDir);
            o["road"] = WbSave.RleEncode(st.Road);
            o["laws"] = JClone(st.Laws);
            var items = new JArray();
            foreach (var it in st.Items) items.Add(JArrClone(it));
            o["items"] = items;
            o["itemSeq"] = st.ItemSeq;
            // —— 触发器行化（triggerToRow L40-42：[id, name, JSON.stringify(cond), action, brush, x, y, r, enabled?1:0, once?1:0, fired, cd, nextFireYear]）——
            o["triggers"] = TriggerRows(st.Triggers);
            o["triggerSeq"] = st.TriggerSeq;
            // —— 军团方阵（蓝本 {...a, members: [...a.members]} ≡ 深克隆）——
            var armies = new JArray();
            foreach (var a in st.Armies) armies.Add(JClone(a));
            o["armies"] = armies;
            o["armySeq"] = st.ArmySeq;
            // —— 战争档案（values only 无 key；行序 = data.warData 输入序）——
            var wars = new JArray();
            if (data["warData"] is JArray warsIn)
            {
                var seen = new HashSet<string>();
                foreach (var t in warsIn)
                {
                    if (!(t is JObject w)) continue;
                    string key = w["key"] != null && w["key"].Type == JTokenType.String ? (string)w["key"] : PairKey(JNum0(w["a"]), JNum0(w["b"]));
                    if (!seen.Add(key)) continue;
                    if (st.WarData.TryGetValue(key, out var wv)) wars.Add(JClone(wv));
                }
            }
            o["warData"] = wars;
            // —— 动态战线（occSet 稀疏编码 [tileIdx, civId, str]；插入序 = 恢复序）——
            var front = new JArray();
            foreach (var r in st.Occ) front.Add(JArrClone(r));
            o["front"] = front;
            o["warShame"] = RowsByKey(data["warShame"] as JArray, k => st.WarShame.TryGetValue(k, out double wv) ? new JValue(wv) : null);
            var dirs = new JArray();
            foreach (var d in st.Directives) dirs.Add(JClone(d));
            o["directives"] = dirs;
            o["dirSeq"] = st.DirSeq;
            // —— 物种进化棘轮基线（[race, gene.s, gene.d, gene.h, gene.r, gen, sub ?? '', beh.join(',')]；data 行序）——
            o["speciesBase"] = SpeciesBaseRows(st, data["speciesBase"] as JArray);
            // —— 终极世界大战（{...ww, belligerents: [...], fallen: [...]} ≡ 深克隆）+ 停战表 ——
            o["worldWar"] = JClone(st.WorldWar);
            o["wwTruce"] = RowsByKey(data["wwTruce"] as JArray, k => st.WwTruce.TryGetValue(k, out double tv) ? new JValue(tv) : null);
            // —— 涌现层 dyn（races 重查注册表 / weapons 克隆 / dctr / ddef / trts）——
            o["dyn"] = DynRows(st, h, data);
            // —— v3 涌现科技/理念/进化图谱 ——
            o["emT"] = EmTRows(st, h, data["emT"] as JArray);
            o["emI"] = EmIRows(st, data["emI"] as JArray);
            o["evo"] = EvoRows(st, data["evo"] as JArray);
            o["evoSeq"] = st.EvoSeq;
            // —— v39 家族谱系 ——
            o["fams"] = FamRows(st, data["fams"] as JArray);
            o["familySeq"] = st.FamilySeq;
            // —— v40 神谕 Agent 法则注册表 ——
            var alws = new JArray();
            foreach (var l in st.AgentLaws) alws.Add(JClone(l));
            o["alws"] = alws;
            o["alwsSeq"] = st.AlwsSeq;
            o["alwsCounters"] = JClone(st.AlwsCounters);
            // —— 自然引擎（板块由 seed 重生，只存动态量）——
            o["nat"] = NatRows(st, h);
            // —— v4 联盟 + v5 造物工坊 ——
            o["als"] = AlsRows(st.Alliances);
            o["allianceSeq"] = st.AllianceSeq;
            o["rrel"] = RRelRows(st, data["rrel"] as JArray);
            o["rmods"] = RModRows(st, data["rmods"] as JArray);
            o["imods"] = RowsByKey(data["imods"] as JArray, k => st.ItemMods.TryGetValue(k, out string jv) ? new JValue(jv) : null);
            o["creg"] = CregRows(st, data["creg"] as JArray);
            return o;
        }

        private static JArray JArrClone2(List<JArray> src)
        {
            var arr = new JArray();
            foreach (var r in src) arr.Add(JArrClone(r));
            return arr;
        }

        /// <summary>triggerToRow 行化（蓝本 L40-42 逐字）</summary>
        private static JArray TriggerRows(List<JObject> trigs)
        {
            var arr = new JArray();
            foreach (var t in trigs)
            {
                arr.Add(new JArray
                {
                    t["id"] ?? JValue.CreateNull(),
                    t["name"] == null ? "" : t["name"].ToString(),
                    (t["cond"] as JObject) == null ? "" : ((JObject)t["cond"]).ToString(Newtonsoft.Json.Formatting.None),
                    t["action"] == null ? "" : t["action"].ToString(),
                    t["brush"] ?? JValue.CreateNull(),
                    t["x"] ?? JValue.CreateNull(),
                    t["y"] ?? JValue.CreateNull(),
                    t["r"] ?? JValue.CreateNull(),
                    JTruthy(t["enabled"]) ? 1 : 0,
                    JTruthy(t["once"]) ? 1 : 0,
                    t["fired"] ?? JValue.CreateNull(),
                    t["cd"] ?? JValue.CreateNull(),
                    t["nextFireYear"] ?? JValue.CreateNull(),
                });
            }
            return arr;
        }

        /// <summary>speciesBase 行化（蓝本 L15237；sub ?? '' / (beh ?? []).join(',')）</summary>
        private static JArray SpeciesBaseRows(WbSaveState st, JArray input)
        {
            var arr = new JArray();
            if (input == null) return arr;
            var seen = new HashSet<int>();
            foreach (var t in input)
            {
                if (!(t is JArray row) || row.Count < 1) continue;
                if (!JIsNum(row[0], out double kd)) continue;
                int race = (int)kd;
                if (!seen.Add(race)) continue;
                if (!st.SpeciesBase.TryGetValue(race, out var b)) continue;
                var gene = b["gene"] as JObject;
                string sub = b["sub"] == null || b["sub"].Type == JTokenType.Null ? "" : b["sub"].ToString();
                string behCsv = "";
                if (b["beh"] is JArray beh) { var parts = new List<string>(); foreach (var x in beh) parts.Add(x.ToString()); behCsv = string.Join(",", parts); }
                arr.Add(new JArray
                {
                    race,
                    gene?["s"] ?? JValue.CreateNull(),
                    gene?["d"] ?? JValue.CreateNull(),
                    gene?["h"] ?? JValue.CreateNull(),
                    gene?["r"] ?? JValue.CreateNull(),
                    b["gen"] ?? JValue.CreateNull(),
                    sub,
                    behCsv,
                });
            }
            return arr;
        }

        // 蓝本 EVO_KINDS（engine.ts L15538）
        private static readonly string[] EvoKinds = { "species", "weapon", "tech", "trait", "society" };

        /// <summary>dyn 全段行化（蓝本 L15245-15268）——races 重查恢复后注册表 / weapons 克隆 / dctr / ddef / trts</summary>
        private static JObject DynRows(WbSaveState st, WbSaveHost h, JObject data)
        {
            var dyn = new JObject();
            var din = data["dyn"] as JObject;
            // —— races：行序 = data.dyn.races 输入序；def = 恢复后注册表（st.RacesOut）；info = st.DynRaces ——
            var races = new JArray();
            if (din?["races"] is JArray rin)
            {
                var seen = new HashSet<int>();
                foreach (var t in rin)
                {
                    if (!(t is JArray row) || row.Count < 1) continue;
                    if (!JIsNum(row[0], out double idd)) continue;
                    int id = (int)idd;
                    if (!seen.Add(id)) continue;
                    st.RacesOut.TryGetValue(id, out var def);
                    st.DynRaces.TryGetValue(id, out var info);
                    string name = def != null && def["name"] != null ? def["name"].ToString() : $"物种{id}";
                    int hp = (int)JRound(JNumOr(def?["hp"], 30));
                    double dmg = JRound(JNumOr(def?["dmg"], 5) * 10) / 10;
                    double speed = JRound(JNumOr(def?["speed"], 0.06) * 1000) / 1000;
                    double repro = JRound(JNumOr(def?["repro"], 0.002) * 10000) / 10000;
                    string tint = def != null && def["dynTint"] != null && def["dynTint"].Type != JTokenType.Null ? def["dynTint"].ToString() : "";
                    int tintIdx = Array.IndexOf(h.DynTints, tint);
                    string eco = info != null && info["eco"] != null && info["eco"].Type != JTokenType.Null ? info["eco"].ToString() : null;
                    int ecoN = eco == "pred" ? 1 : eco == "herb" ? 2 : eco == "neutral" ? 3 : 0;
                    int flags =
                        (def != null && def["isCiv"] != null && def["isCiv"].Type == JTokenType.Boolean && (bool)def["isCiv"] ? 1 : 0) |
                        (def != null && def["hostile"] != null && def["hostile"].Type == JTokenType.Boolean && (bool)def["hostile"] ? 2 : 0) |
                        (def != null && def["predator"] != null && def["predator"].Type == JTokenType.Boolean && (bool)def["predator"] ? 4 : 0);
                    var row14 = new JArray
                    {
                        id,
                        name,
                        info?["parent"] ?? JValue.CreateNull(),
                        hp,
                        dmg,
                        speed,
                        repro,
                        tintIdx,
                    };
                    if (def != null && def["vis"] != null && def["vis"].Type != JTokenType.Null)
                        foreach (var x in WbSave2.VisToTuple(def["vis"] as JObject)) row14.Add(x);   // visToTuple 元组展开
                    else row14.Add(JValue.CreateNull());                                             // undefined → JSON null
                    row14.Add(JNumOr(info?["parent2"], 0) != 0 && info != null && info["parent2"] != null && info["parent2"].Type != JTokenType.Null ? (JToken)JNum0(info["parent2"]) : 0);   // info.parent2 ?? 0
                    row14.Add(ecoN);
                    row14.Add(info != null && info["cap"] != null && info["cap"].Type != JTokenType.Null ? (JToken)JNum0(info["cap"]) : 0);   // info.cap ?? 0
                    row14.Add((int)JRound(JNumOr(def?["maxAge"], 40)));
                    row14.Add(flags);
                    races.Add(row14);
                }
            }
            dyn["races"] = races;
            // —— weapons：行序 = data.dyn.weapons 输入序；值 = st.EmergentWeapons[id] 克隆 ——
            var weps = new JArray();
            if (din?["weapons"] is JArray win)
            {
                var seen = new HashSet<int>();
                foreach (var t in win)
                {
                    if (!(t is JObject w)) continue;
                    if (!JIsNum(w["id"], out double idd)) continue;
                    int id = (int)idd;
                    if (!seen.Add(id)) continue;
                    if (st.EmergentWeapons.TryGetValue(id, out var wv)) weps.Add(JClone(wv));
                }
            }
            dyn["weapons"] = weps;
            dyn["dynSeq"] = st.DynSeq;
            dyn["weapSeq"] = st.WeapSeq;
            // —— dctr：[id, round(p*100)/100, round(s*100)/100, round(t*100)/100, round(a*100)/100] ——
            var dctr = new JArray();
            if (din?["dctr"] is JArray cin)
            {
                var seen = new HashSet<int>();
                foreach (var t in cin)
                {
                    if (!(t is JArray row) || row.Count < 1) continue;
                    if (!JIsNum(row[0], out double idd)) continue;
                    int id = (int)idd;
                    if (!seen.Add(id)) continue;
                    if (!st.Doctrines.TryGetValue(id, out var dv)) continue;
                    dctr.Add(new JArray { id, JRound(dv[0] * 100) / 100, JRound(dv[1] * 100) / 100, JRound(dv[2] * 100) / 100, JRound(dv[3] * 100) / 100 });
                }
            }
            dyn["dctr"] = dctr;
            // —— ddef：[id, round(point), round(armor), round(evade)] ——
            var ddef = new JArray();
            if (din?["ddef"] is JArray dinArr)
            {
                var seen = new HashSet<int>();
                foreach (var t in dinArr)
                {
                    if (!(t is JArray row) || row.Count < 1) continue;
                    if (!JIsNum(row[0], out double idd)) continue;
                    int id = (int)idd;
                    if (!seen.Add(id)) continue;
                    if (!st.Defenses.TryGetValue(id, out var dv)) continue;
                    ddef.Add(new JArray { id, (int)JRound(dv[0]), (int)JRound(dv[1]), (int)JRound(dv[2]) });
                }
            }
            dyn["ddef"] = ddef;
            // —— trts：[key, name, round((dmgMul ?? 1) * 100), ...] ——
            var trts = new JArray();
            if (din?["trts"] is JArray tin)
            {
                var seen = new HashSet<string>();
                foreach (var t in tin)
                {
                    if (!(t is JArray row) || row.Count < 1) continue;
                    string key = row[0] == null ? null : row[0].ToString();
                    if (key == null || !seen.Add(key)) continue;
                    if (!st.DynTraits.TryGetValue(key, out var tv)) continue;
                    trts.Add(new JArray
                    {
                        key,
                        tv["name"] == null ? "" : tv["name"].ToString(),
                        (int)JRound(JNumOr(tv["dmgMul"], 1) * 100),
                        (int)JRound(JNumOr(tv["hpMul"], 1) * 100),
                        (int)JRound(JNumOr(tv["speedMul"], 1) * 100),
                        (int)JRound(JNumOr(tv["regen"], 0) * 1000),
                    });
                }
            }
            dyn["trts"] = trts;
            dyn["traitSeq"] = st.TraitSeq;
            return dyn;
        }

        /// <summary>emT 行化（蓝本 L15271：[t.key, t.name, TECH_CATS.findIndex(cat), t.cost, t.gen, effects csv]）</summary>
        private static JArray EmTRows(WbSaveState st, WbSaveHost h, JArray input)
        {
            var arr = new JArray();
            if (input == null) return arr;
            var seen = new HashSet<string>();
            foreach (var t in input)
            {
                if (!(t is JArray row) || row.Count < 1) continue;
                string key = row[0] == null ? null : row[0].ToString();
                if (key == null || !seen.Add(key)) continue;
                if (!st.EmTechs.TryGetValue(key, out var tv)) continue;
                string cat = tv["cat"] == null ? "" : tv["cat"].ToString();
                int catIdx = h.TechCats.IndexOf(cat);   // findIndex 找不到 → -1
                var effCsv = new List<string>();
                if (tv["effects"] is JArray effs)
                    foreach (var e in effs)
                        if (e is JObject eo) effCsv.Add($"{eo["k"]?.ToString()}:{eo["v"]?.ToString()}");
                arr.Add(new JArray
                {
                    key,
                    tv["name"] == null ? "" : tv["name"].ToString(),
                    catIdx,
                    tv["cost"] ?? JValue.CreateNull(),
                    tv["gen"] ?? JValue.CreateNull(),
                    string.Join(",", effCsv),
                });
            }
            return arr;
        }

        /// <summary>emI 行化（蓝本 L15272：[i.key, i.name, i.desc, mods entries csv]）——mods 键序 = 恢复插入序</summary>
        private static JArray EmIRows(WbSaveState st, JArray input)
        {
            var arr = new JArray();
            if (input == null) return arr;
            var seen = new HashSet<string>();
            foreach (var t in input)
            {
                if (!(t is JArray row) || row.Count < 1) continue;
                string key = row[0] == null ? null : row[0].ToString();
                if (key == null || !seen.Add(key)) continue;
                if (!st.EmIdeas.TryGetValue(key, out var iv)) continue;
                var modsCsv = new List<string>();
                if (iv["mods"] is JObject mods)
                    foreach (var p in mods.Properties())
                        modsCsv.Add($"{p.Name}:{p.Value?.ToString()}");
                arr.Add(new JArray
                {
                    key,
                    iv["name"] == null ? "" : iv["name"].ToString(),
                    iv["desc"] == null ? "" : iv["desc"].ToString(),
                    string.Join(",", modsCsv),
                });
            }
            return arr;
        }

        /// <summary>evo 行化（蓝本 L15273；st.EvoNodes List 序 = 恢复序）</summary>
        private static JArray EvoRows(WbSaveState st, JArray input)
        {
            var arr = new JArray();
            foreach (var n in st.EvoNodes)
            {
                int kindIdx = EvoKinds.IndexOf(n["kind"] == null ? "" : n["kind"].ToString());
                double year = JNum0(n["year"]);
                object parent = n["parent"] == null || n["parent"].Type == JTokenType.Null ? (object)(-1) : (object)JInt(n["parent"]);
                string stat = n["stat"] == null || n["stat"].Type == JTokenType.Null ? "" : n["stat"].ToString();
                string meta = n["meta"] is JObject mo ? mo.ToString(Newtonsoft.Json.Formatting.None) : "";
                arr.Add(new JArray
                {
                    n["id"] ?? JValue.CreateNull(),
                    kindIdx,
                    year,
                    (int)parent,
                    n["name"] == null ? "" : n["name"].ToString(),
                    n["colorHex"] == null ? "" : n["colorHex"].ToString(),
                    n["detail"] == null ? "" : n["detail"].ToString(),
                    stat,
                    JTruthy(n["alive"]) ? 1 : 0,
                    meta,
                });
            }
            return arr;
        }

        /// <summary>fams 行化（蓝本 L15278；data.fams 行序）</summary>
        private static JArray FamRows(WbSaveState st, JArray input)
        {
            var arr = new JArray();
            if (input == null) return arr;
            var seen = new HashSet<int>();
            foreach (var t in input)
            {
                if (!(t is JArray row) || row.Count < 1) continue;
                if (!JIsNum(row[0], out double idd)) continue;
                int id = (int)idd;
                if (!seen.Add(id)) continue;
                if (!st.Families.TryGetValue(id, out var f)) continue;
                arr.Add(new JArray
                {
                    f["id"] ?? JValue.CreateNull(),
                    f["name"] == null ? "" : f["name"].ToString(),
                    f["race"] ?? JValue.CreateNull(),
                    f["founded"] ?? JValue.CreateNull(),
                    f["founder"] == null ? "" : f["founder"].ToString(),
                    f["members"] ?? JValue.CreateNull(),
                    f["heroes"] ?? JValue.CreateNull(),
                    f["kills"] ?? JValue.CreateNull(),
                    f["peak"] ?? JValue.CreateNull(),
                    f["milestones"] ?? JValue.CreateNull(),
                });
            }
            return arr;
        }

        /// <summary>nat 全段（蓝本 L15282-15298；板块由 seed 重生只存动态量）</summary>
        private static JObject NatRows(WbSaveState st, WbSaveHost h)
        {
            var nat = new JObject();
            // —— stress：扫描 boundary（h.BoundaryStress 升序 ≡ nature.boundary Set 序）中 stress>0.5 → [i, min(255, round(v*8))] slice(0,4096) ——
            var stressRows = new JArray();
            var stressByI = new Dictionary<int, double>();
            foreach (var row in st.Nature.Stress) stressByI[(int)row[0]] = row[1];
            // boundary Set 升序（gen 端已 sort；C# HashSet 枚举序不确定 → 显式 OrderBy 锁升序）
            foreach (var si in h.BoundaryStress.OrderBy(x => x))
            {
                if (!stressByI.TryGetValue(si, out double v)) continue;
                if (!(v > 0.5)) continue;
                stressRows.Add(new JArray { si, (int)Math.Min(255, JRound(v * 8)) });
                if (stressRows.Count >= 4096) break;
            }
            nat["stress"] = stressRows;
            // —— storms：[id, round(x*10)/10, round(y*10)/10, round(s*100)/100, ttl, seed, kind==='blizzard'?1:0, name.length, landed?1:0] ——
            var storms = new JArray();
            foreach (var s in st.Nature.Storms)
            {
                double x = JNum0(s["x"]), y = JNum0(s["y"]), str = JNum0(s["strength"]);
                storms.Add(new JArray
                {
                    (int)JNum0(s["id"]),
                    JRound(x * 10) / 10,
                    JRound(y * 10) / 10,
                    JRound(str * 100) / 100,
                    (int)JNum0(s["ttl"]),
                    (int)JNum0(s["seed"]),
                    (string)s["kind"] == "blizzard" ? 1 : 0,
                    (s["name"] == null ? "" : s["name"].ToString()).Length,
                    JTruthy(s["landed"]) ? 1 : 0,
                });
            }
            nat["storms"] = storms;
            nat["ash"] = JRound(st.Nature.Ash * 1000) / 1000;
            nat["seasonOffset"] = st.Nature.SeasonOffset;
            var counters = new JArray();
            foreach (var c in st.Nature.Counters) counters.Add(c);
            nat["counters"] = counters;
            nat["stormSeq"] = st.Nature.StormSeq;
            // —— pcx/pcy：宿主钩子真相（recomputePlates 后质心）→ map round(v*10)/10 ——
            var pcx = new JArray(); var pcy = new JArray();
            foreach (var v in h.HookPlateCx) pcx.Add(JRound(v * 10) / 10);
            foreach (var v in h.HookPlateCy) pcy.Add(JRound(v * 10) / 10);
            nat["pcx"] = pcx;
            nat["pcy"] = pcy;
            nat["pe"] = st.Nature.PlateEpoch;
            // —— hot：宿主真相优先（HotspotsHost = 恢复未命中时 initPlates 真相；null = 恢复命中，状态袋自算）——
            var hot = new JArray();
            if (h.HotspotsHost != null)
            {
                foreach (var row in h.HotspotsHost)
                    hot.Add(new JArray { row.Length > 0 ? row[0] : 0, row.Length > 1 ? row[1] : 0, JRound((row.Length > 2 ? row[2] : 0) * 100) / 100 });
            }
            else
            {
                foreach (var row in st.Nature.Hotspots)
                    hot.Add(new JArray { row[0], row[1], JRound(row[2] * 100) / 100 });
            }
            nat["hot"] = hot;
            // —— ashF：AshFFilled（旧档均匀播撒 ash）→ ash>0.02 全场 [i, round(ash*200)]；稀疏 → 行值展开扫描 >0.02 ——
            var ashRows = new JArray();
            if (st.Nature.AshFFilled)
            {
                if (st.Nature.Ash > 0.02)
                    for (int i = 0; i < h.AshCells; i++) ashRows.Add(new JArray { i, (int)JRound(st.Nature.Ash * 200) });
            }
            else
            {
                var byCi = new Dictionary<int, double>();
                foreach (var row in st.Nature.AshF) byCi[(int)row[0]] = row[1];
                for (int i = 0; i < h.AshCells; i++)
                {
                    if (!byCi.TryGetValue(i, out double v)) continue;
                    if (!(v > 0.02)) continue;
                    ashRows.Add(new JArray { i, (int)JRound(v * 200) });
                }
            }
            nat["ashF"] = ashRows;
            return nat;
        }

        /// <summary>als 行化（蓝本 L15301：[id, name, members.join(','), leader, round(cohesion), formedTick, formedYear, warsTogether, colorHex, bonded?1:0]）</summary>
        private static JArray AlsRows(List<JObject> alliances)
        {
            var arr = new JArray();
            foreach (var al in alliances)
            {
                var members = al["members"] as JArray;
                var mCsv = new List<string>();
                if (members != null) foreach (var m in members) mCsv.Add(m.ToString());
                arr.Add(new JArray
                {
                    (int)JNum0(al["id"]),
                    al["name"] == null || al["name"].Type == JTokenType.Null ? "" : al["name"].ToString(),
                    string.Join(",", mCsv),
                    (int)JNum0(al["leader"]),
                    (int)JRound(JNum0(al["cohesion"])),
                    (int)JNum0(al["formedTick"]),
                    (int)JNum0(al["formedYear"]),
                    (int)JNum0(al["warsTogether"]),
                    al["colorHex"] == null || al["colorHex"].Type == JTokenType.Null ? JValue.CreateNull() : (JToken)al["colorHex"].ToString(),
                    JTruthy(al["bonded"]) ? 1 : 0,
                });
            }
            return arr;
        }

        /// <summary>rrel 行化（蓝本 L15302：[k, Math.round(v)]）</summary>
        private static JArray RRelRows(WbSaveState st, JArray input)
        {
            var arr = new JArray();
            if (input == null) return arr;
            var seen = new HashSet<string>();
            foreach (var t in input)
            {
                if (!(t is JArray row) || row.Count < 2) continue;
                string k = row[0] == null ? null : row[0].ToString();
                if (k == null || !seen.Add(k)) continue;
                if (!st.RaceRel.TryGetValue(k, out double v)) continue;
                arr.Add(new JArray { k, (int)JRound(v) });
            }
            return arr;
        }

        /// <summary>rmods 行化（蓝本 L15304：filter rid<100；恢复负 rid/非 string 已在 st 侧丢弃）</summary>
        private static JArray RModRows(WbSaveState st, JArray input)
        {
            var arr = new JArray();
            if (input == null) return arr;
            var seen = new HashSet<int>();
            foreach (var t in input)
            {
                if (!(t is JArray row) || row.Count < 2) continue;
                if (!JIsNum(row[0], out double rd)) continue;
                int rid = (int)rd;
                if (rid >= 100) continue;               // 蓝本 filter(([rid]) => rid < 100)
                if (!seen.Add(rid)) continue;
                if (!st.RaceMods.TryGetValue(rid, out string json)) continue;
                arr.Add(new JArray { rid, json });
            }
            return arr;
        }

        /// <summary>creg 行化（蓝本 L15305：[uid, rid]；恢复守卫 RACES[rid] 存在 → st 无键跳过）</summary>
        private static JArray CregRows(WbSaveState st, JArray input)
        {
            var arr = new JArray();
            if (input == null) return arr;
            var seen = new HashSet<string>();
            foreach (var t in input)
            {
                if (!(t is JArray row) || row.Count < 2) continue;
                string uid = row[0] == null ? null : row[0].ToString();
                if (uid == null || !seen.Add(uid)) continue;
                if (!st.CreationRaceIds.TryGetValue(uid, out int rid)) continue;
                arr.Add(new JArray { uid, rid });
            }
            return arr;
        }
    }
}
