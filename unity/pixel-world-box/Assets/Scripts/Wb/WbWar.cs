// ============================================================================
// WbWar.cs —— M-U32 大战域本体（engine.ts L7966-8053 / L8380-8700 / L9444-9554 机械翻译）
//   蓝本锚：warTick L7966 / wwAliveBelligerents L8383 / wwIsBelligerent L8390 /
//   devUltimateWar L8395 / worldWarTick L8441 / wwWeaponsTick L8530 / endWorldWar L8624 /
//   launchArtillery L9447 / launchAirstrike L9478 / launchMissile L9488 / launchLaser L9499 /
//   launchDroneSwarm L9524 / launchOrbital L9533 / launchPlasma L9539 / launchAntimatter L9548
// 切片边界（挂账注记）：devWwTruce/devWwResume/devWwEnd L8648-8693（开发者面板件——依赖
//   makePeace→settleFront 战线域未译，TickOrch 无槽无生产者，随战线域切片）；statsTick
//   L13568（worldWarTick→statsTick 调用点——TickOrch.cs L9 双侧不记协议 no-op）；WBB.touchMeta
//   （槽 59 前半 no-op——warTick L7967/worldWarTick L8442 调用点注记）；launchMech L9557
//   （非 wwWeaponsTick callee——机甲域挂账）。
// DIVERGENCE（M-U32 入档）：warTick 三处 ep() 热路径——engineParams L33-35 黄金驱动默认值
//   内联（war.tensionDecay=0.92 / war.milPressure=0.06 / war.declareRate=1——M-U7m 先例，
//   ep 参数域切片挂账）。
// ============================================================================
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace PixelWorldBox.Wb
{
    /// <summary>大战域（warTick/worldWarTick/wwWeaponsTick/launch 八件）——域家族单文件</summary>
    public static class WbWar
    {
        public const int WW_TRUCE_TICKS = 600;    // engine L6913（大战自动停战 15 年）
        public const int WW_ANTI_CD = 1200;       // engine L6916（反物质全局冷却 30 年）

        private static bool JIsNum(JToken t, out double v)
        {
            v = 0;
            if (t == null || t.Type != JTokenType.Float && t.Type != JTokenType.Integer) return false;
            v = t.Value<double>();
            return true;
        }

        private static double JNullish(JObject o, string key, double d)
        {
            var t = o[key];
            return (t == null || t.Type == JTokenType.Null) ? d : t.Value<double>();
        }

        private static bool JTruthy(JToken t)
            => t != null && t.Type != JTokenType.Null
               && (t.Type == JTokenType.Boolean ? t.Value<bool>()
                   : t.Type == JTokenType.Integer || t.Type == JTokenType.Float ? t.Value<double>() != 0
                   : t.Type == JTokenType.String ? t.Value<string>().Length > 0
                   : true);

        // ---------------- warTick（engine L7966-8053）—— 槽 25 ----------------

        /// <summary>engine warTick L7966-8053 —— 关系三分支 + 和平面 + emergent 常规发射（每 200 tick）</summary>
        public static void WarTick(WbWorld w)
        {
            // WBB.touchMeta() —— Stage 3：战争体系写 army 等 meta 列收口（槽 59 前半 no-op——M-U28 协议）
            foreach (string key in w.met)                                                                                   // L7968（Set 插入序枚举——C# HashSet 无删除面同序）
            {
                double v = w.rel.TryGetValue(key, out var v0) ? v0 : 0;                                                     // L7969（rel.get(key) ?? 0）
                if (v < -20)                                                                                                 // L7970
                {
                    if (!w.laws.wars)                                                                                        // L7971
                    {
                        // 战争被禁止：神谕加速停火（神意凌驾于战争理由之上）
                        if (w.Rng() < 0.5)                                                                                   // L7973（1 掷）
                        {
                            int dash0 = key.IndexOf('-');
                            int a0 = int.Parse(key.Substring(0, dash0));
                            int b0 = int.Parse(key.Substring(dash0 + 1));
                            WbCiv ca = a0 < w.civs.Count ? w.civs[a0] : null;                                                 // L7975-7976
                            WbCiv cb = b0 < w.civs.Count ? w.civs[b0] : null;
                            w.rel[key] = 30;                                                                                  // L7977
                            w.totalWars.Remove(key);                                                                          // L7978
                            w.warData.Remove(key);                                                                            // L7979
                            if (ca != null && ca.alive && cb != null && cb.alive)                                             // L7980
                            {
                                w.Toast($"「{ca.name}」与「{cb.name}」停战了", "peace");                                       // L7981
                                w.AddEvent("peace", $"神谕止战：「{ca.name}」与「{cb.name}」签署停战协议", ca.colorHex);       // L7982
                            }
                        }
                        else
                        {
                            w.rel[key] = v + 6;                                                                               // L7985
                        }
                    }
                    else
                    {
                        // 交战期间：关系冻结——停战唯一途径=目的达成/无力支撑（warInfoTick 全权裁决）
                        // 灭国战争仇恨缓慢固化；常规战争由战事活跃签名驱动仇恨（warInfoTick）
                        if (w.totalWars.Contains(key)) w.rel[key] = System.Math.Max(-96, v - 0.5);                            // L7990
                    }
                }
                else
                {
                    w.totalWars.Remove(key);                                                                                  // L7993
                    int dash = key.IndexOf('-');
                    int a = int.Parse(key.Substring(0, dash));                                                                // L7994-7995
                    int b = int.Parse(key.Substring(dash + 1));
                    WbCiv ca = a < w.civs.Count ? w.civs[a] : null;                                                           // L7997-7998
                    WbCiv cb = b < w.civs.Count ? w.civs[b] : null;
                    // —— 边境摩擦：和平消化衰减 × 军国主义大国被动增压（扩张停滞的年代，野心仍在滋长） ——
                    double ten = (w.tension.TryGetValue(key, out var tv) ? tv : 0) * 0.92;                                    // L8000（ep('war.tensionDecay') 内联 0.92——DIVERGENCE 注记）
                    double milPair = (ca != null ? (ca.militarism ?? 30) : 30) + (cb != null ? (cb.militarism ?? 30) : 30);   // L8001（?? 30 语义）
                    if (milPair > 105) ten += (milPair - 105) * 0.06;                                                         // L8002（ep('war.milPressure') 内联 0.06）
                    ten = System.Math.Min(80, ten);                                                                           // L8003
                    w.tension[key] = ten;                                                                                     // L8004
                    // —— 和平水位：不再单向漂到 60 —— 军国主义高的两国关系自然冷淡；摩擦把水位压得更低
                    double mil = (ca != null ? (ca.militarism ?? 30) : 30) + (cb != null ? (cb.militarism ?? 30) : 30);       // L8006
                    double target = System.Math.Max(8, 38 - mil / 8) + System.Math.Min(16, ten * 0.18);                       // L8007
                    if (v < target) w.rel[key] = v + 1;                                                                       // L8008
                    else if (v > target + 8) w.rel[key] = v - 1;                                                              // L8009（过热关系回冷——盟友也会疏远）
                    // —— 战端重燃：摩擦 + 军国主义 + 宿怨共同抬高概率（替代旧日的窄窗彩票） ——
                    if (w.laws.wars && v < 45 && ca != null && ca.alive && cb != null && cb.alive && !w.warData.ContainsKey(key))   // L8012
                    {
                        double grudge = v < -5 ? 0.02 : 0;                                                                    // L8013（宿怨余烬）
                        // —— 种族互连：好战种族的组合更易开战；同族相残更难（种族认同）——
                        var raW = WbCivSim.RaceAggrOf(ca.race);                                                                    // L8015-8017（RACES[].aggr ?? 0.5——RaceAggrOf 译件内建缺省）
                        var rbW = WbCivSim.RaceAggrOf(cb.race);
                        double aggrMul = 0.7 + (raW + rbW) / 2 * 0.6;
                        double sameRace = ca.race == cb.race ? 0.55 : 1;                                                       // L8018
                        // —— 种族关系底色：世仇种族的王国更易开战（精灵与兽人的边境从不安静）——
                        double rr = ca.race == cb.race ? 0 : w.RaceRelOf(ca.race, cb.race);                                    // L8020
                        double rrMul = rr < -30 ? 1.35 : rr > 30 ? 0.75 : 1;                                                    // L8021
                        // —— 大灾不兴刀兵：受灾国（首都近灾点且灾后 100 tick 内）短期免遭落井下石 ——
                        double catastMul = 1;                                                                                   // L8023
                        if (w.tickCount - w.lastCatastropheTick < 100)                                                          // L8024
                        {
                            foreach (var c in new[] { ca, cb })                                                                  // L8025
                            {
                                if (c != null && c.capital >= 0
                                    && WbMath.FdHypot(WbWorld.TileX(c.capital) - w.lastCatastropheX, WbWorld.TileY(c.capital) - w.lastCatastropheY) < 12)   // L8026（Math.hypot 位级）
                                {
                                    catastMul = 0.3; break;
                                }
                            }
                        }
                        double p = (0.008 + ten * 0.0011 + mil * 0.00007 + grudge) * aggrMul * sameRace * rrMul * catastMul * 1.0;   // L8029（ep('war.declareRate') 内联 1.0）
                        if (w.Rng() < p)                                                                                        // L8030（宣战掷）
                        {
                            var pick = WbCivSim.PickCasus(w, ca, cb);                                                           // L8031（内部 2-3 掷）
                            // 节奏阀：每文明十年内至多主动挑起一场新战争（防连环开战的混战地狱）
                            long now = w.tickCount;                                                                              // L8033
                            if (now - (w.lastDeclareAt.TryGetValue(pick.aggressor.id, out var lda) ? lda : -9000000000000L) > 400)   // L8034（?? -9e9）
                            {
                                w.lastDeclareAt[pick.aggressor.id] = now;                                                        // L8035
                                WbCivSim.DeclareWar(w, pick.aggressor.id, pick.victim.id, pick.reason);                          // L8036（declareWar 零掷面）
                                w.tension[key] = System.Math.Max(0, ten - 25);                                                   // L8037（宣战泄压）
                            }
                        }
                    }
                }
            }
            // —— 涌现武器常规发射（非大战期：交战国小概率动用在役涌现设计） ——
            if (w.emergentWeapons.Count > 0)                                                                                // L8044（size>0 门）
            {
                foreach (var c in w.civs)                                                                                    // L8045
                {
                    if (!c.alive || !WbArmory.CivAtWar(w, c.id)) continue;                                                    // L8046（civAtWar 门）
                    var em = new List<JObject>();                                                                             // L8047（filter !retired && civ===c.id——插入序）
                    foreach (int wid in w.emergentWeaponKeys)
                        if (w.emergentWeapons.TryGetValue(wid, out var x) && !(x.Value<bool?>("retired") ?? false)
                            && x.Value<int?>("civ") == c.id) em.Add(x);
                    if (em.Count > 0 && w.Rng() < 0.12)                                                                       // L8048（0.12 掷）
                    {
                        WbArmory.FireEmergent(w, c, em[(int)System.Math.Floor(w.Rng() * em.Count)]);                           // L8049（选掷+发射——M-U31 译件）
                    }
                }
            }
        }

        // ---------------- 大战参战国面（engine L8383-8392） ----------------

        /// <summary>engine wwAliveBelligerents L8383-8387 —— 大战中仍在世参战国</summary>
        public static List<WbCiv> WwAliveBelligerents(WbWorld w)
        {
            var list = new List<WbCiv>();
            foreach (int id in w.worldWar.belligerents)                                                                     // L8384（map→filter c is Civ）
            {
                if (id < w.civs.Count) { var c = w.civs[id]; if (c != null && c.alive && c.pop > 0) list.Add(c); }
            }
            return list;
        }

        /// <summary>engine wwIsBelligerent L8390-8392 —— 是否为大战参战国（running 阶段）</summary>
        public static bool WwIsBelligerent(WbWorld w, int civId)
            => w.worldWar.phase == "running" && w.worldWar.belligerents.Contains(civId);                                     // L8391

        // ---------------- devUltimateWar（engine L8395-8438） ----------------

        /// <summary>engine devUltimateWar L8395-8438 —— 引燃终极世界大战</summary>
        public static bool DevUltimateWar(WbWorld w)
        {
            if (w.worldWar.phase == "running") return false;                                                                 // L8396
            var alive = new List<WbCiv>();
            foreach (var c in w.civs) if (c.alive && c.pop > 0) alive.Add(c);                                                 // L8397
            if (alive.Count < 2)                                                                                              // L8398
            {
                w.Toast("世上王国不足两个，无从点燃世界大战", "info");                                                         // L8399
                return false;                                                                                                  // L8400
            }
            w.worldWar = new WbWorldWar                                                                                       // L8402-8421（全字段重置）
            {
                phase = "running",
                startTick = (int)w.tickCount,
                startYear = (int)System.Math.Floor(w.yearF),
                endTick = 0,
                belligerents = alive.ConvertAll(c => c.id),
                kills = 0,
                fallen = new List<WbWwFallen>(),
                truces = 0,
                nukes = 0, lasers = 0, drones = 0, orbitals = 0, plasmas = 0, antimatters = 0,
                emerged = 0,
                winner = null,
                endText = "",
            };
            foreach (var c in alive) w.worldWar.pop0[c.id] = c.pop;                                                           // L8408（Object.fromEntries）
            w.wwTruce.Clear();                                                                                                 // L8422
            // —— 联盟阵营化：盟友不互相宣战（阵营对峙取代全员互殴）；无联盟才退回全员互战 ——
            int n = 0;                                                                                                         // L8424
            int blocKept = 0;                                                                                                  // L8425
            for (int i = 0; i < alive.Count; i++)                                                                              // L8426
            {
                for (int j = i + 1; j < alive.Count; j++)                                                                       // L8427
                {
                    var alI = WbCivSim.AllianceOfCiv(w, alive[i].id);                                                           // L8428
                    if (alI != null && alI.members.Contains(alive[j].id)) { blocKept++; continue; }                              // L8429（同盟不战）
                    if (WbCivSim.DeclareWar(w, alive[i].id, alive[j].id, "annex", true, 0, true, true) != null) n++;             // L8430（force/total/quiet——返回值判真）
                }
            }
            w.AddEvent("worldwar", $"终极世界大战爆发！{alive.Count} 个王国卷入战火{(blocKept > 0 ? $"——{blocKept} 对盟友暂守盟约（阵营对峙）" : "——不死不休，直至只剩一国或全部覆灭")}", "#ff4d4d");   // L8433
            w.Toast($"终极世界大战爆发：{n} 条战线同时点燃", "war");                                                            // L8434
            w.shake = System.Math.Max(w.shake, 10);                                                                             // L8435
            // statsTick() —— 统计域未译（TickOrch.cs L9 双侧不记协议 no-op——蓝本 L8436 调用点注记）
            return true;                                                                                                        // L8437
        }

        // ---------------- worldWarTick（engine L8441-8526）—— 槽 26 ----------------

        /// <summary>engine worldWarTick L8441-8526 —— 大战主循环（每 30 tick）：终局判定 → 停战到期重启 → 战端重燃 → 现代武器部署</summary>
        public static void WorldWarTick(WbWorld w)
        {
            // WBB.touchMeta() —— 槽 59 前半 no-op（蓝本 L8442 注记）
            var ww = w.worldWar;                                                                                               // L8443
            // —— 自然引燃（Task 34 去虚务实）：火器时代以后，多国长期混战有概率失控升级为世界大战 ——
            if (ww.phase != "running" && w.laws.wars && w.tickCount - w.wwIgniteTick >= 400)                                    // L8446
            {
                w.wwIgniteTick = w.tickCount;                                                                                   // L8447
                double sinceEnd = ww.phase == "ended" ? w.tickCount - ww.endTick : double.PositiveInfinity;                     // L8448（Infinity）
                if (sinceEnd > 1600)                                                                                            // L8449（大战余烬冷却 40 年）
                {
                    var aliveW = new List<WbCiv>();
                    foreach (var c in w.civs) if (c.alive && c.pop > 0) aliveW.Add(c);                                           // L8450
                    var armed = new List<WbCiv>();
                    foreach (var c in aliveW) if (WbArmory.ArmamentOf(w, c) >= 4) armed.Add(c);                                   // L8451（armamentOf M-U30 译件）
                    int activeWars = 0;
                    foreach (var _wd in w.warData.Values) activeWars++;                                                           // L8452-8453
                    // 引燃的火药桶三形态（满足其一即是失控前兆）：
                    // ① 多线开战（activeWars ≥ 2） ② 战端频仍（近 40 年宣战 ≥3） ③ 长期消耗战 + 列强军国狂热（堑壕战泥潭）
                    int recentWars = 0;
                    foreach (int t in w.warHistory) if (w.tickCount - t <= 1600) recentWars++;                                     // L8456
                    bool longWar = false;
                    foreach (var wd in w.warData.Values)                                                                           // L8458
                    {
                        if (w.tickCount - wd.startTick >= 600) { longWar = true; break; }                                           // L8459
                    }
                    double milSum = 0;
                    foreach (var c in armed) milSum += (c.militarism ?? 30);                                                        // L8461（reduce + ?? 30）
                    bool milHot = armed.Count > 0 && armed.Count > 0 && milSum / armed.Count >= 50;
                    if (aliveW.Count >= 3 && armed.Count >= 2 && (activeWars >= 2 || recentWars >= 3 || (longWar && milHot)) && w.yearF > 80 && w.Rng() < 0.16)   // L8462（0.16 引燃掷）
                    {
                        if (DevUltimateWar(w))                                                                                      // L8463
                        {
                            w.AddEvent("worldwar", "世界滑向深渊——列强的军备竞赛与连年混战终于失控，战火燃遍全球", "#ff4d4d");       // L8464
                        }
                    }
                }
            }
            if (ww.phase != "running") return;                                                                                  // L8469
            var alive = WwAliveBelligerents(w);                                                                                  // L8470
            // —— 终局：只剩一国（胜者）或全部灭亡（同归于尽）——
            if (alive.Count <= 1)                                                                                               // L8472
            {
                EndWorldWar(w, alive.Count > 0 ? alive[0] : null);                                                               // L8473（?? null）
                return;
            }
            // —— 联盟终局：所有存活参战国同属一个联盟 → 阵营胜利（大战结束，盟主代领战功）——
            var firstAl = WbCivSim.AllianceOfCiv(w, alive[0].id);                                                               // L8477
            if (firstAl != null && alive.TrueForAll(c => { var al = WbCivSim.AllianceOfCiv(w, c.id); return al != null && al.id == firstAl.id; }))   // L8478
            {
                var leader = firstAl.leader < w.civs.Count ? w.civs[firstAl.leader] : null;                                      // L8479
                ww.phase = "ended";                                                                                              // L8480
                ww.endTick = (int)w.tickCount;                                                                                   // L8481
                ww.winner = leader != null ? (int?)leader.id : null;                                                             // L8482（?? null）
                ww.endText = $"「{firstAl.name}」以阵营之姿终结了大战——第 {System.Math.Max(0, System.Math.Floor(w.yearF)) - ww.startYear} 年，盟旗插遍了废墟";   // L8483
                w.AddEvent("worldwar", $"终极世界大战终局：「{firstAl.name}」的同盟笑到了最后——阵营协作击败了所有孤军", firstAl.colorHex);   // L8484
                w.Toast($"大战结束——「{firstAl.name}」阵营胜利", "good");                                                        // L8485
                w.wwTruce.Clear();                                                                                               // L8486
                foreach (int m in firstAl.members)                                                                               // L8487
                {
                    var mc = m < w.civs.Count ? w.civs[m] : null;
                    if (mc != null && mc.alive) { firstAl.cohesion = System.Math.Min(100, firstAl.cohesion + 15); break; }        // L8489
                }
                // statsTick() —— 双侧不记协议 no-op（蓝本 L8491 调用点）
                return;
            }
            // —— 停战到期：战端重启 ——
            int resumed = 0;                                                                                                     // L8495
            var truceKeys = new List<string>(w.wwTruce.Keys);                                                                    // L8496（[...entries()] 快照序）
            foreach (string key in truceKeys)
            {
                long until = w.wwTruce.TryGetValue(key, out var u) ? u : 0;
                if (w.tickCount < until) continue;                                                                               // L8497
                w.wwTruce.Remove(key);                                                                                           // L8498
                int dash = key.IndexOf('-');
                int a = int.Parse(key.Substring(0, dash));                                                                       // L8499-8501
                int b = int.Parse(key.Substring(dash + 1));
                WbCiv ca = a < w.civs.Count ? w.civs[a] : null;
                WbCiv cb = b < w.civs.Count ? w.civs[b] : null;
                if ((ca == null || !ca.alive) || (cb == null || !cb.alive)) continue;                                            // L8502
                WbCivSim.DeclareWar(w, a, b, "annex", true, 0, true, true);                                                       // L8503（force/total/quiet）
                resumed++;
            }
            if (resumed > 0 && w.Rng() < 0.6)                                                                                    // L8506（0.6 播报掷）
            {
                w.AddEvent("worldwar", $"停战期满，{resumed} 条战线重燃战火——大战没有出口，只有终局", "#ff4d4d");                 // L8507
            }
            // —— 战端重燃：既未交战也未停战的参战对 → 强制宣战（任何和平途径都被推翻）——
            // 联盟阵营化：同联盟不重燃（阵营是大战中的秩序孤岛）；终局狂热（存活≤3）时盟约撕裂 —— 末日之下，盟约成了废纸
            bool wwFrenzy = alive.Count <= 3;                                                                                     // L8511
            for (int i = 0; i < alive.Count; i++)                                                                                 // L8512
            {
                for (int j = i + 1; j < alive.Count; j++)                                                                          // L8513
                {
                    string key = WbWorld.PairKey(alive[i].id, alive[j].id);                                                         // L8514
                    if (w.wwTruce.ContainsKey(key) || WbCivSim.AtWar(w, alive[i].id, alive[j].id)) continue;                        // L8515
                    var alI = WbCivSim.AllianceOfCiv(w, alive[i].id);                                                               // L8516
                    if (!wwFrenzy && alI != null && alI.members.Contains(alive[j].id)) continue;                                     // L8517
                    if (wwFrenzy && alI != null && alI.members.Contains(alive[j].id))                                                // L8518
                    {
                        WbCivSim.DissolveAlliance(w, alI, $"终局狂热之下，「{alI.name}」的盟友们反目成仇——末日面前，盟约成了废纸");   // L8519
                    }
                    WbCivSim.DeclareWar(w, alive[i].id, alive[j].id, "annex", true, 0, true, true);                                  // L8521（force/total/quiet）
                }
            }
            // —— 现代武器部署（工业时代军备的国家倾泻火力）——
            WwWeaponsTick(w, alive);                                                                                                 // L8525
        }

        // ---------------- wwWeaponsTick（engine L8530-8621） ----------------

        /// <summary>engine wwWeaponsTick L8530-8621 —— 大战期间的武器部署：现代（火炮/空袭/导弹/核） + 未来（激光/蜂群/轨道/等离子/反物质）
        /// 终局狂热（存活 ≤ 3 国）：武器频率翻倍 + 反物质解禁</summary>
        public static void WwWeaponsTick(WbWorld w, List<WbCiv> alive)
        {
            // —— 终局狂热：最后的三强倾尽武库（每轮大战只播报一次）——
            bool frenzy = alive.Count <= 3;                                                                                          // L8532
            if (frenzy && w.wwFrenzyAnnounced != w.worldWar.startTick)                                                                // L8533
            {
                w.wwFrenzyAnnounced = w.worldWar.startTick;                                                                           // L8534
                w.AddEvent("worldwar", "终局狂热——仅存的三强倾尽武库，反物质武器解禁，毁灭不再有禁忌", "#ff4d4d");                    // L8535
                w.Toast("终局狂热：反物质武器解禁", "danger");                                                                        // L8536
            }
            double rate = frenzy ? 2 : 1;                                                                                             // L8538
            foreach (var c in alive)                                                                                                   // L8539
            {
                var tm = WbCivSim.TechModsOf(w, c.id);                                                                                 // L8540
                if (tm.arty <= 0 && tm.bomber <= 0 && tm.nukeCap <= 0 && tm.laser <= 0 && tm.drone <= 0 && tm.orbital <= 0 && tm.plasma <= 0 && tm.antiMatter <= 0) continue;   // L8541
                var foes = new List<WbCiv>();
                foreach (var o in alive) if (o.id != c.id) foes.Add(o);                                                                 // L8542
                if (foes.Count == 0) continue;                                                                                          // L8543
                var foe = foes[(int)System.Math.Floor(w.Rng() * foes.Count)];                                                           // L8544（foe 选掷）
                int tgtTile = foe.capital >= 0 ? foe.capital : (foe.tiles.Count > 0 ? foe.tiles[0] : -1);                                // L8545（?? -1）
                // —— 反物质打击（天启：仅终局狂热阶段解禁，全局冷却 30 年）——
                if (tm.antiMatter > 0 && frenzy && tgtTile >= 0 && w.tickCount - w.wwLastAntiTick > WW_ANTI_CD && w.Rng() < 0.12)       // L8547
                {
                    w.wwLastAntiTick = w.tickCount;                                                                                       // L8548
                    w.worldWar.antimatters++;                                                                                             // L8549
                    double tx = WbWorld.TileX(tgtTile) + 0.5;                                                                                   // L8550-8551
                    double ty = WbWorld.TileY(tgtTile) + 0.5;
                    LaunchAntimatter(w, c, tx, ty);                                                                                       // L8552
                    w.AddEvent("superweapon", $"⚠ 湮灭警报——「{c.name}」的反物质弹升空，目标：「{foe.name}」的心脏，接触即湮灭", c.colorHex, tx, ty);   // L8553
                    continue;
                }
                // —— 轨道天罚（天基动能钨棒：大威力爆破 + 地形焦化）——
                if (tm.orbital > 0 && tgtTile >= 0 && w.Rng() < 0.08 * rate)                                                              // L8557
                {
                    w.worldWar.orbitals++;                                                                                                 // L8558
                    double tx = WbWorld.TileX(tgtTile) + 0.5;
                    double ty = WbWorld.TileY(tgtTile) + 0.5;
                    LaunchOrbital(w, c, tx, ty);                                                                                           // L8561
                    w.AddEvent("superweapon", $"「{c.name}」的轨道天基平台亮起——钨棒脱离轨道，坠向「{foe.name}」", c.colorHex, tx, ty);     // L8562
                    continue;
                }
                // —— 等离子炮（大威力 + 电磁脉冲击溃士气）——
                if (tm.plasma > 0 && tgtTile >= 0 && w.Rng() < 0.12 * rate)                                                                // L8566
                {
                    w.worldWar.plasmas++;                                                                                                   // L8567
                    double tx = WbWorld.TileX(tgtTile) + 0.5;
                    double ty = WbWorld.TileY(tgtTile) + 0.5;
                    LaunchPlasma(w, c, tx, ty);                                                                                             // L8570
                    w.AddEvent("superweapon", $"「{c.name}」的等离子炮充能完毕——电浆光球划破长空", c.colorHex, tx, ty);                     // L8571
                    continue;
                }
                // —— 无人机蜂群（自主游猎扫射）——
                if (tm.drone > 0 && tgtTile >= 0 && w.Rng() < 0.16 * rate)                                                                 // L8575
                {
                    w.worldWar.drones++;                                                                                                    // L8576
                    LaunchDroneSwarm(w, c, WbWorld.TileX(tgtTile) + 0.5, WbWorld.TileY(tgtTile) + 0.5);                                                  // L8577
                    w.AddEvent("superweapon", $"「{c.name}」的无人机蜂群升空——自主游猎，杀向「{foe.name}」纵深", c.colorHex);               // L8578
                    continue;
                }
                // —— 激光炮台（高频精确狙杀，无冷却限制）——
                if (tm.laser > 0 && w.Rng() < 0.3 * rate)                                                                                   // L8582
                {
                    w.worldWar.lasers++;                                                                                                    // L8583
                    LaunchLaser(w, c, foe);                                                                                                  // L8584
                    continue;
                }
                // —— 核打击（终局武器：全局冷却 15 年 + 概率发射）——
                if (tm.nukeCap > 0 && tgtTile >= 0 && w.tickCount - w.wwLastNukeTick > WW_TRUCE_TICKS && w.Rng() < 0.06 * rate)             // L8588
                {
                    w.wwLastNukeTick = w.tickCount;                                                                                          // L8589
                    w.worldWar.nukes++;                                                                                                      // L8590
                    double tx = WbWorld.TileX(tgtTile) + 0.5;
                    double ty = WbWorld.TileY(tgtTile) + 0.5;
                    LaunchMissile(w, c, tx, ty, 1.8);                                                                                        // L8593
                    w.AddEvent("worldwar", $"「{c.name}」的核导弹拖着尾焰升空——目标：「{foe.name}」的心脏", c.colorHex, tx, ty);             // L8594
                    continue;
                }
                // —— 常规导弹打击（现代军备级）——
                if (tm.arty > 0 && WbArmory.ArmamentOf(w, c) >= 5 && tgtTile >= 0 && w.Rng() < 0.06 * rate)                                  // L8598
                {
                    LaunchMissile(w, c, WbWorld.TileX(tgtTile) + 0.5, WbWorld.TileY(tgtTile) + 0.5, 0);                                                   // L8599
                    continue;
                }
                // —— 空袭轰炸 ——
                if (tm.bomber > 0 && tgtTile >= 0 && w.Rng() < 0.08 * rate)                                                                  // L8603
                {
                    LaunchAirstrike(w, c, WbWorld.TileX(tgtTile) + 0.5, WbWorld.TileY(tgtTile) + 0.5);                                                    // L8604
                    continue;
                }
                // —— 火炮轰击（对敌境建筑与军队）——
                if (tm.arty > 0 && w.Rng() < 0.25 * rate)                                                                                    // L8608
                {
                    LaunchArtillery(w, c, foe);                                                                                               // L8609
                }
                // —— 涌现武器（架构化：供能组件决定射击节奏——奇点供能射得欢，化学装药慢工细活）——
                var em = new List<JObject>();                                                                                                 // L8612
                foreach (int wid in w.emergentWeaponKeys)
                    if (w.emergentWeapons.TryGetValue(wid, out var x) && !(x.Value<bool?>("retired") ?? false) && x.Value<int?>("civ") == c.id) em.Add(x);
                foreach (var x in em)                                                                                                         // L8613
                {
                    double q3 = x["q"] != null && x["q"].Type == JTokenType.Array && ((JArray)x["q"]).Count > 3 ? ((JArray)x["q"])[3].Value<double>() : 1;   // L8614（q?.[3] ?? 1）
                    double cad = WbArmory.WcPowers[(int)JNullish(x, "pw", 0)].cadence * q3;
                    if (w.Rng() < 0.11 * rate * cad)                                                                                           // L8615
                    {
                        WbArmory.FireEmergent(w, c, x);                                                                                         // L8616（M-U31 译件——生产者接线）
                        break;                                                                                                                  // L8617（每国每轮至多一次涌现打击——防弹幕洗屏）
                    }
                }
            }
        }

        // ---------------- endWorldWar（engine L8624-8646） ----------------

        /// <summary>engine endWorldWar L8624-8646 —— 终局结算：胜者通吃 / 同归于尽 / 神谕中止</summary>
        public static void EndWorldWar(WbWorld w, WbCiv winner, bool divine = false)
        {
            var ww = w.worldWar;                                                                                                         // L8625
            ww.phase = "ended";                                                                                                           // L8626
            ww.endTick = (int)w.tickCount;                                                                                                 // L8627
            ww.winner = winner != null ? (int?)winner.id : null;                                                                           // L8628（?? null）
            long years = System.Math.Max(0, (long)System.Math.Floor(w.yearF) - ww.startYear);                                              // L8629
            if (divine)                                                                                                                    // L8630
            {
                ww.endText = $"神谕降临，大战被强行中止——第 {years} 年，没有胜者，只有废墟";                                                  // L8631
                w.AddEvent("worldwar", $"神谕终止了终极世界大战：{ww.belligerents.Count} 国混战 {years} 年，战火被神意掐灭", "#ffd93d");     // L8632
                w.Toast("终极世界大战被神谕终止", "info");                                                                                    // L8633
            }
            else if (winner != null)                                                                                                       // L8634
            {
                ww.endText = $"「{winner.name}」笑到了最后——第 {years} 年，战火燃尽，世界归于一面旗帜之下";                                  // L8635
                w.AddEvent("worldwar", $"终极世界大战终局：{ww.belligerents.Count} 国混战 {years} 年，「{winner.name}」踏着 {ww.fallen.Count} 面倒下的旗帜统一了世界", winner.colorHex);   // L8636
                w.Toast($"终极世界大战结束——「{winner.name}」赢得了一切", "good");                                                            // L8637
            }
            else                                                                                                                           // L8638
            {
                ww.endText = $"同归于尽——第 {years} 年，最后一个参战国也倒下了，只余焦土与寂静";                                              // L8639
                w.AddEvent("worldwar", $"终极世界大战终局：{ww.belligerents.Count} 国混战 {years} 年，同归于尽——世上再无参战国", "#ff4d4d"); // L8640
                w.Toast("终极世界大战结束——所有参战国同归于尽", "danger");                                                                    // L8641
            }
            w.wwTruce.Clear();                                                                                                              // L8643
            w.shake = System.Math.Max(w.shake, 8);                                                                                          // L8644
            // statsTick() —— 双侧不记协议 no-op（蓝本 L8645 调用点）
        }

        // ---------------- launch 八件（engine L9447-9554） ----------------

        /// <summary>engine launchArtillery L9447-9475 —— 火炮轰击：从己方前线建筑向敌国目标发射炮弹（抛物线弹道 + 落点爆破）</summary>
        public static void LaunchArtillery(WbWorld w, WbCiv c, WbCiv foe)
        {
            // 目标：敌国随机建筑（无建筑则打敌军单位）
            double tx = -1, ty = -1;                                                                                                        // L9449-9450
            var foeBuilds = new List<WbBuilding>();
            foreach (var b in w.buildings) if (b.civ == foe.id) foeBuilds.Add(b);                                                            // L9451
            if (foeBuilds.Count > 0)                                                                                                         // L9452
            {
                var bsel = foeBuilds[(int)System.Math.Floor(w.Rng() * foeBuilds.Count)];                                                      // L9453（选掷）
                tx = bsel.x + 0.5;                                                                                                             // L9454-9455
                ty = bsel.y + 0.5;
            }
            else
            {
                WbU tu = null;                                                                                                                  // L9457（find !dead && civ===foe.id——扫描序）
                foreach (var u in w.units) { if (u.dead == 0 && u.civ == foe.id) { tu = u; break; } }
                if (tu != null) { tx = tu.x; ty = tu.y; }                                                                                       // L9458
            }
            if (tx < 0) return;                                                                                                                  // L9460
            // 炮位：己方距目标最近的建筑（前线炮兵阵地）
            double sx = WbCivSim.CivCenterX(w, c);                                                                                               // L9462-9463
            double sy = WbCivSim.CivCenterY(w, c);
            double bestD = double.PositiveInfinity;
            foreach (var b in w.buildings)                                                                                                       // L9465
            {
                if (b.civ != c.id) continue;                                                                                                      // L9466
                double d = WbMath.FdHypot(b.x - tx, b.y - ty);                                                                                     // L9467
                if (d < bestD) { bestD = d; sx = b.x + 0.5; sy = b.y + 0.5; }                                                                       // L9468
            }
            if (bestD < 6) return;                                                                                                                // L9470（贴脸无需炮击——近战解决）
            double dist = WbMath.FdHypot(tx - sx, ty - sy);                                                                                        // L9471
            double ttl = System.Math.Max(16, System.Math.Min(60, WbMath.JsRound(dist * 1.1)));                                                       // L9472（JsRound 位级）
            double dmgV = 26 + w.Rng() * 14;                                                                                                        // L9473（dmg 掷 1——JS opts 求值序位 1）
            int? fireV = w.Rng() < 0.5 ? (int?)1 : (int?)0;                                                                                          // L9473（fire 掷 2——opts.fire 先于 fx 内部双掷〔M-U31 教训同款：JS 对象字面量求值序〕）
            var fx = w.Fx("shell", tx, ty, ttl, optR: 1.6, optX0: sx, optY0: sy, optDmg: dmgV);                                                      // L9473（fx 内 2 掷 seed/dir——位 3/4）
            fx.fire = fireV;                                                                                                                        // L9473（opts.fire 后赋）
            fx.src = c.id;                                                                                                                          // L9473（opts.src 后赋——M-U31 先例）
            if (w.Rng() < 0.25) { /* onSound('boom') —— 宿主回调 no-op（蓝本 L9474） */ }
        }

        /// <summary>engine launchAirstrike L9478-9485 —— 空袭：轰炸机从己方腹地飞向敌国纵深，沿途投弹</summary>
        public static void LaunchAirstrike(WbWorld w, WbCiv c, double tx, double ty)
        {
            double sx = WbCivSim.CivCenterX(w, c);                                                                                                  // L9479-9480
            double sy = WbCivSim.CivCenterY(w, c);
            double dist = WbMath.FdHypot(tx - sx, ty - sy);                                                                                          // L9481
            double ttl = System.Math.Max(40, System.Math.Min(120, WbMath.JsRound(dist * 1.6)));                                                        // L9482
            var fx = w.Fx("airstrike", tx, ty, ttl, optR: 1.4, optX0: sx, optY0: sy, optDmg: 30);                                                    // L9483（fx 2 掷——dmg 常数）
            fx.src = c.id;                                                                                                                            // L9483（opts.src）
            w.AddEvent("worldwar", $"「{c.name}」的轰炸机编队升空，朝敌境纵深飞去", c.colorHex, sx, sy);                                              // L9484
        }

        /// <summary>engine launchMissile L9488-9494 —— 导弹打击：从己方腹地发射（nukePower &gt; 0 时为核弹头，命中升起蘑菇云）</summary>
        public static void LaunchMissile(WbWorld w, WbCiv c, double tx, double ty, double nukePower = 0)
        {
            double sx = WbCivSim.CivCenterX(w, c);                                                                                                    // L9489-9490
            double sy = WbCivSim.CivCenterY(w, c);
            double dist = WbMath.FdHypot(tx - sx, ty - sy);                                                                                            // L9491
            double ttl = System.Math.Max(30, System.Math.Min(90, WbMath.JsRound(dist * 1.2)));                                                            // L9492
            var fx = w.Fx("missile", tx, ty, ttl, optR: nukePower > 0 ? 0 : 2.8, optX0: sx, optY0: sy, optDmg: nukePower > 0 ? 0 : 60);                 // L9493（核常分叉——r/dmg 门）
            fx.src = c.id;                                                                                                                              // L9493（opts.src）
            fx.nuke = nukePower;                                                                                                                        // L9493（opts.nuke——当量透传）
        }

        /// <summary>engine launchLaser L9499-9521 —— 激光炮台：从己方前沿阵地向敌军单位射出瞬时相干光束（线杀伤 + 焦点全伤）</summary>
        public static void LaunchLaser(WbWorld w, WbCiv c, WbCiv foe)
        {
            // 目标：敌国单位随机采样（军职加权优先——狙杀战斗人员）
            WbU tgt = null;                                                                                                                              // L9501
            double bestScore = 0;                                                                                                                        // L9502
            for (int k = 0; k < 12; k++)                                                                                                                  // L9503
            {
                int idx = (int)System.Math.Floor(w.Rng() * w.units.Count);                                                                                 // L9504（采样掷 1）
                var u = idx < w.units.Count ? w.units[idx] : null;
                if (u == null || u.dead != 0 || u.civ != foe.id) continue;                                                                                  // L9505
                double s = (u.job == 1 || u.job == 2 ? 2 : 1) + w.Rng();                                                                                     // L9506（加权掷 2）
                if (s > bestScore) { bestScore = s; tgt = u; }                                                                                               // L9507
            }
            if (tgt == null) return;                                                                                                                        // L9509
            // 炮位：距目标最近的己方建筑（前沿激光阵地）
            double sx = WbCivSim.CivCenterX(w, c);                                                                                                          // L9511-9512
            double sy = WbCivSim.CivCenterY(w, c);
            double bestD = double.PositiveInfinity;
            foreach (var b in w.buildings)                                                                                                                   // L9514
            {
                if (b.civ != c.id) continue;                                                                                                                  // L9515
                double d = WbMath.FdHypot(b.x - tgt.x, b.y - tgt.y);                                                                                           // L9516
                if (d < bestD) { bestD = d; sx = b.x + 0.5; sy = b.y + 0.5; }                                                                                   // L9517
            }
            if (bestD < 3) return;                                                                                                                            // L9519（贴脸门）
            var fx = w.Fx("laser", tgt.x, tgt.y, 8, optX0: sx, optY0: sy, optDmg: 34 + w.Rng() * 14);                                                          // L9520（dmg 掷+fx 2 掷）
            fx.src = c.id;                                                                                                                                      // L9520（opts.src）
        }

        /// <summary>engine launchDroneSwarm L9524-9530 —— 无人机蜂群：从腹地放飞自主蜂群，沿途游猎扫射，终点集束爆破</summary>
        public static void LaunchDroneSwarm(WbWorld w, WbCiv c, double tx, double ty)
        {
            double sx = WbCivSim.CivCenterX(w, c);                                                                                                          // L9525-9526
            double sy = WbCivSim.CivCenterY(w, c);
            double dist = WbMath.FdHypot(tx - sx, ty - sy);                                                                                                  // L9527
            double ttl = System.Math.Max(50, System.Math.Min(150, WbMath.JsRound(dist * 1.9)));                                                                // L9528
            var fx = w.Fx("drone", tx, ty, ttl, optR: 2.6, optX0: sx, optY0: sy, optDmg: 14 + w.Rng() * 6);                                                  // L9529（dmg 掷+fx 2 掷）
            fx.src = c.id;                                                                                                                                    // L9529
        }

        /// <summary>engine launchOrbital L9533-9536 —— 轨道天罚：天基动能平台投下钨棒（天顶垂直坠落 → 大威力爆破 + 地形焦化）</summary>
        public static void LaunchOrbital(WbWorld w, WbCiv c, double tx, double ty)
        {
            var fx = w.Fx("orbital", tx, ty, 30);                                                                                              // L9534（fx 2 掷——opts {src} 无 r/dmg）
            fx.src = c.id;                                                                                                                      // L9534（opts.src=c.id——src 通道非 civ）
            if (w.Rng() < 0.5) { /* onSound('nuke') —— 宿主回调 no-op（蓝本 L9535） */ }
        }

        /// <summary>engine launchPlasma L9539-9545 —— 等离子炮：慢速电浆光球（命中大威力爆破 + 电磁脉冲击溃周遭士气）</summary>
        public static void LaunchPlasma(WbWorld w, WbCiv c, double tx, double ty)
        {
            double sx = WbCivSim.CivCenterX(w, c);                                                                                                            // L9540-9541
            double sy = WbCivSim.CivCenterY(w, c);
            double dist = WbMath.FdHypot(tx - sx, ty - sy);                                                                                                    // L9542
            double ttl = System.Math.Max(45, System.Math.Min(110, WbMath.JsRound(dist * 1.5)));                                                                  // L9543
            var fx = w.Fx("plasma", tx, ty, ttl, optR: 3.2, optX0: sx, optY0: sy, optDmg: 78 + w.Rng() * 22);                                                  // L9544（dmg 掷+fx 2 掷）
            fx.src = c.id;                                                                                                                                      // L9544
        }

        /// <summary>engine launchAntimatter L9548-9554 —— 反物质打击：湮灭天启（全屏白闪 + 半径湮灭 + 地形玻璃化）</summary>
        public static void LaunchAntimatter(WbWorld w, WbCiv c, double tx, double ty)
        {
            double sx = WbCivSim.CivCenterX(w, c);                                                                                                              // L9549-9550
            double sy = WbCivSim.CivCenterY(w, c);
            double dist = WbMath.FdHypot(tx - sx, ty - sy);                                                                                                      // L9551
            double ttl = System.Math.Max(50, System.Math.Min(130, WbMath.JsRound(dist * 1.4)));                                                                    // L9552
            var fx = w.Fx("antimatter", tx, ty, ttl, optX0: sx, optY0: sy);                                                                                      // L9553（fx 2 掷——无 dmg/r）
            fx.src = c.id;                                                                                                                                        // L9553
        }
    }
}
