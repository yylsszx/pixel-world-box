// ============================================================================
// WbWar.cs —— M-U32 大战域本体 + M-U33 warInfoTick 域（engine.ts L7085-7719 / L7966-8053 /
//   L8380-8700 / L9444-9554 机械翻译）
//   蓝本锚：M-U32 warTick L7966 / wwAliveBelligerents L8383 / wwIsBelligerent L8390 /
//   devUltimateWar L8395 / worldWarTick L8441 / wwWeaponsTick L8530 / endWorldWar L8624 /
//   launchArtillery L9447 / launchAirstrike L9478 / launchMissile L9488 / launchLaser L9499 /
//   launchDroneSwarm L9524 / launchOrbital L9533 / launchPlasma L9539 / launchAntimatter L9548；
//   M-U33 settleFront L7370 / sustainOf L7085 / warGoalNow L7117 / warGoalMet L7151 /
//   concludeGoalWar L7156 / warInfoTick L7399 / concludeByScore L7672 / touchesOwner L7711
// 切片边界（挂账注记）：devWwTruce/devWwResume/devWwEnd L8648-8693（开发者面板件——M-U33
//   makePeace→settleFront 依赖已出清，解锁钥匙就位，随 devWw 面板域切片）；statsTick
//   L13568（worldWarTick→statsTick 调用点——TickOrch.cs L9 双侧不记协议 no-op）；WBB.touchMeta
//   （槽 59 前半 no-op——warTick L7967/worldWarTick L8442 调用点注记）；launchMech L9557
//   （非 wwWeaponsTick callee——机甲域挂账）；setFrozen L7401（宿主 UI 态 no-op——M-U33）。
// DIVERGENCE（M-U32 入档）：warTick 三处 ep() 热路径——engineParams L33-35 黄金驱动默认值
//   内联（war.tensionDecay=0.92 / war.milPressure=0.06 / war.declareRate=1——M-U7m 先例，
//   ep 参数域切片挂账）。
// ============================================================================
using System.Collections.Generic;
using System.Linq;
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

        // ---------------- warInfoTick 域（engine L7085-7719）—— M-U33 槽 28 ----------------
        // 纪律②铁证：黄金 warinfo.json 18 场景先行落盘（gen-warinfo.mjs det 双跑字节级
        //   md5 65b8f3de），parity 红证 Test56/57 Failed 2（哨兵爆点）→ 本全译复绿。

        private static readonly HashSet<int> Capturable = new HashSet<int> { 1, 4, 9, 5, 7 };   // types.ts L343（HOUSE/FARM/MARKET/BARRACKS/PORT）

        /// <summary>engine settleFront L7370-7386 —— 停战结算战线：高强度占领转正（割让），低强度归还</summary>
        public static (int ceded, int returned) SettleFront(WbWorld w, int a, int b)
        {
            int ceded = 0;                                                                                               // L7371
            int returned = 0;                                                                                             // L7372
            foreach (int i in w.occSet.ToList())                                                                           // L7373（[...occSet] 快照——删除安全；割让/归还计数与 tiles 入账逐格独立——序不敏感面）
            {
                int oc = w.occCiv[i];                                                                                     // L7374
                if (oc != a && oc != b) continue;                                                                          // L7375
                int o = w.owner[i];                                                                                       // L7376
                if (oc == a && o == b)                                                                                     // L7377
                {
                    if (w.occStr[i] >= 70) { WbCivSim.FrontSolidify(w, i, a); ceded++; }                                    // L7378（战线域译件复用——WbCivSim L4039）
                    else { w.occCiv[i] = -1; w.occStr[i] = 0; w.occSet.Remove(i); returned++; }                             // L7379
                }
                else if (oc == b && o == a)                                                                                // L7380
                {
                    if (w.occStr[i] >= 70) { WbCivSim.FrontSolidify(w, i, b); ceded++; }                                    // L7381
                    else { w.occCiv[i] = -1; w.occStr[i] = 0; w.occSet.Remove(i); returned++; }                             // L7382
                }
            }
            return (ceded, returned);                                                                                     // L7385
        }

        /// <summary>engine sustainOf L7085-7114 —— 战争承受力（0-100）：军心/财富/政体支撑 − 伤亡/家园烽火/战局不利/人口凋敝。跌破 25 = 无力支撑</summary>
        public static double SustainOf(WbWorld w, WbCiv civ, WbWarData wd, bool isA)
        {
            double ex = isA ? wd.exA : wd.exB;                                                                             // L7086
            double myScore = isA ? wd.scoreA : wd.scoreB;                                                                   // L7087
            double foeScore = isA ? wd.scoreB : wd.scoreA;                                                                   // L7088
            double razedAgainst = isA ? wd.razedB : wd.razedA;                                                               // L7089
            int pop0 = isA ? wd.popA0 : wd.popB0;                                                                           // L7090
            double s = 66;                                                                                                 // L7091
            s += (civ.militarism ?? 30) * 0.28;                                                                             // L7092
            s += System.Math.Min(16, (civ.gold ?? 0) * 0.05);                                                               // L7093
            if (civ.gov == 4) s += 8;                                                                                       // L7094
            if ((civ.mobilizeUntil ?? 0) > w.tickCount) s += 12;                                                             // L7095
            // —— 联盟并肩：盟友正与同一敌人交战 → 盟军并肩作战承受力 +10 ——
            var alSide = WbCivSim.AllianceOfCiv(w, civ.id);                                                                 // L7097
            if (alSide != null)                                                                                            // L7098
            {
                int foe = isA ? wd.b : wd.a;                                                                                // L7099
                foreach (int m in alSide.members)                                                                            // L7100
                {
                    if (m != civ.id && WbCivSim.AtWar(w, m, foe)) { s += 10; break; }                                        // L7101
                }
            }
            // —— 季节互连：冬季战役自古艰难 ——
            if (w.NatureSeason() == 3) s -= 6;                                                                              // L7105（nature.season getter——yearF 推导同构）
            // —— 生态互连：饥荒年月 ——
            if (w.ecoState == "collapse") s -= 8;                                                                           // L7107
            s -= ex * 0.5;                                                                                                 // L7108
            s -= (isA ? (wd.wearA ?? 0) : (wd.wearB ?? 0)) * 0.24;                                                           // L7109（厌战度侵蚀）
            s -= razedAgainst * 1.2;                                                                                       // L7110
            s -= System.Math.Max(0, foeScore - myScore) * 0.4;                                                               // L7111
            s -= System.Math.Max(0, 1 - System.Math.Max(0, civ.pop) / (double)System.Math.Max(1, pop0)) * 70;                // L7112（f64 除法——int/int 整除陷阱）
            return System.Math.Max(0, System.Math.Min(100, s));                                                             // L7113
        }

        /// <summary>engine warGoalNow L7117-7137 —— 战争目的当前进度（goal=0 摧毁战争以敌方人口凋敝度 0-100 计；整值域）</summary>
        public static double WarGoalNow(WbWorld w, WbWarData wd)
        {
            bool aggIsA = wd.aggressor == wd.a;                                                                             // L7118
            if (wd.goal <= 0)                                                                                              // L7119
            {
                WbCiv vic = aggIsA ? (wd.b < w.civs.Count ? w.civs[wd.b] : null) : (wd.a < w.civs.Count ? w.civs[wd.a] : null);   // L7120
                int pop0 = aggIsA ? wd.popB0 : wd.popA0;                                                                    // L7121
                if (vic == null || pop0 <= 0) return 0;                                                                     // L7122
                return WbMath.JsRound((1 - System.Math.Max(0, vic.pop) / (double)pop0) * 100);                               // L7123（round half-up）
            }
            double aggScore = aggIsA ? wd.scoreA : wd.scoreB;                                                               // L7125-7126
            double foeScore = aggIsA ? wd.scoreB : wd.scoreA;
            int occ = aggIsA ? wd.occA : wd.occB;                                                                           // L7127
            switch (wd.reason)                                                                                              // L7128
            {
                case "border":
                case "conquest":
                    return occ;                                                                                            // L7131
                case "revenge":
                    return System.Math.Max(0, WbMath.JsRound(aggScore - foeScore));                                         // L7133
                default:
                    return System.Math.Max(0, WbMath.JsRound(aggScore));                                                    // L7135
            }
        }

        /// <summary>engine warGoalMet L7151-7153 —— 目的是否达成（goal=0 摧毁战争由灭国结算，不走此门）</summary>
        public static bool WarGoalMet(WbWorld w, WbWarData wd)
            => wd.goal > 0 && WarGoalNow(w, wd) >= wd.goal;                                                                 // L7152

        /// <summary>engine concludeGoalWar L7156-7175 —— 目的达成的终战：战胜国按理由提取战利品（索赔赔款 / 占领地保留）</summary>
        public static void ConcludeGoalWar(WbWorld w, WbWarData wd)
        {
            WbCiv ca = wd.a < w.civs.Count ? w.civs[wd.a] : null;                                                           // L7157-7159（?? ca）
            WbCiv cb = wd.b < w.civs.Count ? w.civs[wd.b] : null;
            WbCiv agg = wd.aggressor < w.civs.Count && w.civs[wd.aggressor] != null ? w.civs[wd.aggressor] : ca;
            if (ca == null || !ca.alive || cb == null || !cb.alive || agg == null || !agg.alive) return;                     // L7160
            WbCiv vic = agg == ca ? cb : ca;                                                                                // L7161
            if (wd.reason == "plunder" || wd.reason == "revenge")                                                            // L7162
            {
                double loot = System.Math.Min(vic.gold ?? 0, wd.reason == "revenge" ? 90 : 70);                              // L7163
                if (loot > 0)                                                                                              // L7164
                {
                    vic.gold = (vic.gold ?? 0) - loot;                                                                      // L7165-7166
                    agg.gold = (agg.gold ?? 0) + loot;
                }
                WbCivSim.MakePeace(w, agg.id, vic.id, $"「{agg.name}」的{WbCivSim.CasusLabel(wd.reason)}大功告成{(loot > 0 ? $"，索赔 {loot} 财富" : "")}，如愿收兵", 10);   // L7168（loot f64→string——fixture 整值域）
                if (loot > 0) w.AddEvent("loot", $"「{agg.name}」从「{vic.name}」索得 {loot} 财富赔款", agg.colorHex);              // L7169
            }
            else
            {
                int occ = wd.aggressor == wd.a ? wd.occA : wd.occB;                                                         // L7171
                WbCivSim.MakePeace(w, agg.id, vic.id, $"「{agg.name}」的{WbCivSim.CasusLabel(wd.reason)}目的达成——夺取 {occ} 格疆土，战线成为新国界", 10);   // L7172
                if (occ > 0) w.AddEvent("cession", $"「{agg.name}」经此一役尽得 {occ} 格疆土，「{vic.name}」被迫接受新国界", agg.colorHex);   // L7173
            }
        }

        /// <summary>engine warInfoTick L7399-7609 —— 战争体系升级：财政/建档/停战裁决/签名/厌战/承受力（每 100 tick）—— 槽 28</summary>
        public static void WarInfoTick(WbWorld w)
        {
            // setFrozen(warData.size > 0 || worldWar.phase === 'running') —— 决战冻结（蓝本 L7401；
            //   online-store collectorStats.frozen 宿主 UI 态——纪律③宿主效应 no-op 注记，M-U27 onSound 先例）
            // —— 战争财政（Task 34 经济闭环）：交战国每轮（2.5 年）支付战争维持费 ——
            foreach (var c in w.civs)                                                                                       // L7404
            {
                if (!c.alive || c.pop <= 0 || !WbCivSim.CivAtWar(w, c.id)) continue;                                         // L7405
                double cost = System.Math.Min(30, 3 + System.Math.Floor(c.pop * 0.12));                                      // L7406
                if ((c.gold ?? 0) >= cost)
                {
                    c.gold = (c.gold ?? 0) - cost;                                                                           // L7408
                }
                else
                {
                    c.gold = 0;                                                                                             // L7410
                    c.stability = System.Math.Max(0, c.stability - 0.8);                                                     // L7411（战争贷款压垮民意；?? 70——WbCiv 默认 70 同构）
                }
                c.expense = WbMath.JsRound((c.expense + cost) * 10) / 10;                                             // L7413（Math.round half-up → JsRound；expense 非 null 域）
            }
            // 新战争建档（直设 rel 的漏网之鱼兜底：旧存档/分裂残余）
            foreach (var kv in w.rel.ToList())                                                                               // L7416（Map 插入序快照——C# Dictionary 无删除面同序）
            {
                string key = kv.Key;
                double v = kv.Value;
                if (v < -20 && !w.warData.ContainsKey(key))                                                                   // L7417
                {
                    int dash = key.IndexOf('-');
                    int a = int.Parse(key.Substring(0, dash));                                                                // L7418-7420
                    int b = int.Parse(key.Substring(dash + 1));
                    WbCiv ca = a < w.civs.Count ? w.civs[a] : null;                                                           // L7421-7422
                    WbCiv cb = b < w.civs.Count ? w.civs[b] : null;
                    if (ca == null || !ca.alive || cb == null || !cb.alive) continue;                                         // L7423
                    var wd = WbCivSim.EnsureWarData(w, a, b);                                                                  // L7424
                    if (wd != null)
                    {
                        // 推断理由：-75 以下视为深仇灭国，否则按边境战争补档
                        wd.reason = v <= -75 ? "annex" : "border";                                                             // L7427
                        wd.total = v <= -75 || w.totalWars.Contains(key);                                                       // L7428
                        if (wd.total) w.totalWars.Add(key);                                                                     // L7429
                        wd.aggressor = ca.pop >= cb.pop ? a : b;                                                                // L7430
                        wd.reasonText = WbCivSim.CasusText(w, ca, cb, wd.reason, 0);                                             // L7431
                    }
                }
            }
            foreach (var kv in w.warData.ToList())                                                                             // L7435（[...entries] 快照——删除安全）
            {
                string key = kv.Key;
                var wd = kv.Value;
                WbCiv ca = wd.a < w.civs.Count ? w.civs[wd.a] : null;                                                           // L7436-7437
                WbCiv cb = wd.b < w.civs.Count ? w.civs[wd.b] : null;
                if (ca == null || !ca.alive || cb == null || !cb.alive) { w.warData.Remove(key); continue; }                     // L7438
                if ((w.rel.TryGetValue(key, out var relPre) ? relPre : 0) >= -20) { w.warData.Remove(key); continue; }           // L7439（已停战）
                // —— 终极世界大战：崩溃方只能乞求临时停战（到期自动重燃）——
                if (w.worldWar.phase == "running" && WwIsBelligerent(w, wd.a) && WwIsBelligerent(w, wd.b))                       // L7441
                {
                    double sAw = SustainOf(w, ca, wd, true);                                                                     // L7442-7443
                    double sBw = SustainOf(w, cb, wd, false);
                    if ((sAw < 25 || sBw < 25) && w.Rng() < 0.5)                                                                  // L7444
                    {
                        var broken = sAw < 25 ? ca : cb;                                                                          // L7445
                        w.AddEvent("collapse", $"「{broken.name}」民穷财尽、战线崩溃——只能乞求临时停战喘息", broken.colorHex);           // L7446
                        WbCivSim.MakePeace(w, ca.id, cb.id, $"终极世界大战暂时平息：「{ca.name}」与「{cb.name}」罢兵休整（战端随时重燃）", 5);   // L7447
                    }
                    continue;                                                                                               // L7449（大战期间跳过常规终战裁决）
                }
                // —— 现代武器（常规战争）：火炮 ——
                var tmA2 = WbCivSim.TechModsOf(w, wd.a);                                                                     // L7452-7453
                var tmB2 = WbCivSim.TechModsOf(w, wd.b);
                if ((tmA2.arty > 0 || tmB2.arty > 0) && w.Rng() < 0.12)                                                       // L7454
                {
                    var shooter = tmA2.arty > 0 && (tmB2.arty <= 0 || w.Rng() < 0.5) ? ca : cb;                               // L7455
                    var target = shooter == ca ? cb : ca;                                                                     // L7456
                    LaunchArtillery(w, shooter, target);                                                                       // L7457
                }
                // —— 激光炮台 ——
                if ((tmA2.laser > 0 || tmB2.laser > 0) && w.Rng() < 0.2)                                                       // L7460
                {
                    var shooter = tmA2.laser > 0 && (tmB2.laser <= 0 || w.Rng() < 0.5) ? ca : cb;                              // L7461
                    var target = shooter == ca ? cb : ca;
                    LaunchLaser(w, shooter, target);                                                                           // L7463
                }
                // —— 无人机蜂群 ——
                if ((tmA2.drone > 0 || tmB2.drone > 0) && w.Rng() < 0.1)                                                       // L7466
                {
                    var shooter = tmA2.drone > 0 && (tmB2.drone <= 0 || w.Rng() < 0.5) ? ca : cb;                              // L7467
                    var target = shooter == ca ? cb : ca;
                    int tt = target.capital >= 0 ? target.capital : (target.tiles.Count > 0 ? target.tiles[0] : -1);             // L7469（tiles[0] ?? -1）
                    if (tt >= 0) LaunchDroneSwarm(w, shooter, WbWorld.TileX(tt) + 0.5, WbWorld.TileY(tt) + 0.5);                 // L7470
                }
                // —— 战事活跃签名：有战果 → 仇恨加深 + 重置沉寂计时 ——
                double sig = wd.casA + wd.casB + wd.razedA + wd.razedB + wd.occA + wd.occB + wd.battles * 3;                     // L7473
                if (!wd.sigMark.HasValue || sig != wd.sigMark.Value)                                                             // L7474（sig !== sigMark——undefined 首进双态镜像）
                {
                    double gained = sig - (wd.sigMark.HasValue ? wd.sigMark.Value : sig);                                         // L7475
                    wd.sigMark = sig;                                                                                           // L7476
                    wd.lastActiveTick = w.tickCount;                                                                             // L7477
                    double v0 = w.rel.TryGetValue(key, out var rv0) ? rv0 : 0;                                                    // L7478-7479
                    w.rel[key] = System.Math.Max(-96, v0 - 2);
                    // —— 厌战方向修正（Task 35）：胜利方回落 / 失利方上升 ——
                    bool aAhead = (wd.scoreA - wd.scoreB) >= 0;                                                                   // L7482
                    int kw = (int)System.Math.Min(3, System.Math.Ceiling(gained / 6));                                            // L7483
                    if (aAhead)                                                                                                  // L7484
                    {
                        wd.wearA = System.Math.Max(0, (wd.wearA ?? 0) - 3 * kw);                                                  // L7485-7486
                        wd.wearB = System.Math.Min(100, (wd.wearB ?? 0) + 1.2 * kw);
                    }
                    else
                    {
                        wd.wearB = System.Math.Max(0, (wd.wearB ?? 0) - 3 * kw);                                                  // L7488-7489
                        wd.wearA = System.Math.Min(100, (wd.wearA ?? 0) + 1.2 * kw);
                    }
                }
                // —— 厌战度累积：久战无果 + 民生凋敝（每轮 2.5 年 +1.8 基线；人口跌破 75% 加速）——
                var alA = WbCivSim.AllianceOfCiv(w, wd.a);                                                                       // L7494-7495
                var alB = WbCivSim.AllianceOfCiv(w, wd.b);
                double allyA = alA != null ? (alA.members.Any(m => m != wd.a && WbCivSim.AtWar(w, m, wd.b)) ? 0.85 : 1) : 1;          // L7496-7497
                double allyB = alB != null ? (alB.members.Any(m => m != wd.b && WbCivSim.AtWar(w, m, wd.a)) ? 0.85 : 1) : 1;
                const double wearBase = 1.8;                                                                                     // L7498
                var imA = WbCivSim.IdeaModsOf(w, wd.a);                                                                          // L7499-7500
                var imB = WbCivSim.IdeaModsOf(w, wd.b);
                double popRatioA = System.Math.Max(0, ca.pop) / (double)System.Math.Max(1, wd.popA0);                             // L7501-7502
                double popRatioB = System.Math.Max(0, cb.pop) / (double)System.Math.Max(1, wd.popB0);
                wd.wearA = System.Math.Min(100, (wd.wearA ?? 0) + (wearBase + (popRatioA < 0.75 ? 2.2 : 0) + (wd.razedA > 0 ? 0 : 0.4)) * (1 + (imA.wear ?? 0)) * allyA);   // L7503-7504
                wd.wearB = System.Math.Min(100, (wd.wearB ?? 0) + (wearBase + (popRatioB < 0.75 ? 2.2 : 0) + (wd.razedB > 0 ? 0 : 0.4)) * (1 + (imB.wear ?? 0)) * allyB);
                // —— 单边厌战崩溃（Task 35）：落后方厌战爆表 → 被迫屈膝求和 ——
                if (!wd.total && ((wd.wearA ?? 0) > 82 || (wd.wearB ?? 0) > 82))                                                  // L7506
                {
                    var weary = (wd.wearA ?? 0) > 82 ? ca : cb;                                                                   // L7507
                    double diff = wd.scoreA - wd.scoreB;                                                                          // L7508
                    var winner = diff >= 0 ? ca : cb;                                                                             // L7509-7510
                    var loser = diff >= 0 ? cb : ca;
                    if (ReferenceEquals(weary, loser))                                                                            // L7511
                    {
                        w.AddEvent("collapse", $"「{weary.name}」厌战怒火沸腾，政局摇摇欲坠——被迫屈膝求和", weary.colorHex);              // L7512
                        int cap = wd.reason == "border" ? System.Math.Max(6, wd.goal) : wd.reason == "plunder" || wd.reason == "revenge" ? 10 : 40;   // L7513
                        ConcludeByScore(w, winner, loser, cap);                                                                    // L7514
                    }
                    else
                    {
                        WbCivSim.MakePeace(w, ca.id, cb.id, $"「{weary.name}」虽占上风却民怨沸腾，见好就收，两国罢兵言和", 8);                    // L7516
                    }
                    continue;                                                                                                 // L7518
                }
                // —— 双高厌战 + 战线沉寂 → 民意压垮战争 ——
                if ((wd.wearA ?? 0) > 62 && (wd.wearB ?? 0) > 62 && w.tickCount - wd.lastActiveTick > 500 && !wd.total)               // L7521
                {
                    w.AddEvent("collapse", $"「{ca.name}」与「{cb.name}」两国怨声载道，民意压垮了战争", ca.colorHex);                    // L7522-7523
                    WbCivSim.MakePeace(w, ca.id, cb.id, $"「{ca.name}」与「{cb.name}」不堪连年征战，民间厌战沸腾，两国罢兵", 8);
                    continue;                                                                                                 // L7524
                }
                // —— 仇恨燎原 → 升级为灭国战争（不死不休）——
                double rel = w.rel.TryGetValue(key, out var rv1) ? rv1 : 0;                                                    // L7527
                if (rel < -75 && !w.totalWars.Contains(key) && w.laws.wars)                                                     // L7528
                {
                    w.totalWars.Add(key);                                                                                     // L7529-7530
                    wd.total = true;
                    int dash2 = key.IndexOf('-');
                    int x = int.Parse(key.Substring(0, dash2));                                                                   // L7531（split('-').map(Number)）
                    int y = int.Parse(key.Substring(dash2 + 1));
                    var cx = x < w.civs.Count ? w.civs[x] : null;                                                                 // L7532-7533
                    var cy = y < w.civs.Count ? w.civs[y] : null;
                    if (cx != null && cx.alive && cy != null && cy.alive)                                                         // L7534
                    {
                        var agg = wd.aggressor == x ? cx : cy;                                                                    // L7535-7539
                        var vic = wd.aggressor == x ? cy : cx;
                        wd.reason = "annex";
                        wd.goal = 0;
                        wd.reasonText = WbCivSim.CasusText(w, agg, vic, "annex", 0);
                        w.AddEvent("totalwar", $"「{cx.name}」与「{cy.name}」的战争升级为灭国战争——不摧毁对方最后一座城池决不罢休", cx.colorHex);   // L7540-7541
                        w.Toast($"「{cx.name}」与「{cy.name}」的灭国战争开始了", "war");
                    }
                    if (wd.giveUpAt == 0) wd.giveUpAt = w.tickCount + 3600;                                                       // L7543
                }
                // —— ① 目的达成 → 终战 ——
                wd.goalNow = (int)WarGoalNow(w, wd);                                                                             // L7546（occ/round 整值域 cast）
                if (WarGoalMet(w, wd)) { ConcludeGoalWar(w, wd); continue; }                                                      // L7547
                // —— ② 灭国战争久攻不下 → 攻方放弃（灭国可以失败！）——
                if (wd.total && wd.giveUpAt > 0 && w.tickCount > wd.giveUpAt)                                                     // L7549
                {
                    bool aAhead2 = wd.scoreA >= wd.scoreB;                                                                        // L7550-7552
                    var winner = aAhead2 ? ca : cb;
                    var quitter = aAhead2 ? cb : ca;
                    w.totalWars.Remove(key);                                                                                     // L7553-7554
                    w.warData.Remove(key);
                    w.rel[key] = -5;                                                                                             // L7555（怀恨在心）
                    w.AddEvent("peace", $"灭国战争草草收场：「{quitter.name}」久攻「{winner.name}」不下，师老兵疲，只得罢兵", winner.colorHex);        // L7556-7557
                    w.AddEvent("collapse", $"「{quitter.name}」国力耗竭，无力支撑灭国宏图", quitter.colorHex);
                    w.Toast($"「{quitter.name}」的灭国战争失败了", "info");                                                                        // L7558
                    continue;                                                                                                 // L7559
                }
                // —— ③ 战争承受力（0-100，<25 崩溃）——
                double sA = SustainOf(w, ca, wd, true);                                                                         // L7562-7565
                double sB = SustainOf(w, cb, wd, false);
                bool aBroken = sA < 25;
                bool bBroken = sB < 25;
                if (wd.total)                                                                                                   // L7566
                {
                    // 灭国/统一/叛乱战争：唯攻方崩溃才作罢——守方撑不住也要战至亡国
                    bool aggBroken = wd.aggressor == wd.a ? aBroken : bBroken;                                                    // L7568
                    var agg = wd.aggressor < w.civs.Count ? w.civs[wd.aggressor] : null;                                          // L7569
                    if (aggBroken && agg != null && agg.alive && w.Rng() < 0.5)                                                   // L7570
                    {
                        w.totalWars.Remove(key);                                                                                 // L7571-7573
                        w.warData.Remove(key);
                        w.rel[key] = -5;
                        w.AddEvent("collapse", $"「{agg.name}」民穷财尽，无力支撑灭国战争，攻势土崩瓦解", agg.colorHex);                    // L7574-7575
                        w.AddEvent("peace", $"「{ca.name}」与「{cb.name}」的灭国战争无果而终，两国罢兵", ca.colorHex);
                        w.Toast($"「{agg.name}」的灭国战争失败了", "info");                                                                        // L7576
                    }
                    continue;                                                                                                 // L7578（守方崩溃不停战：战至最后）
                }
                if (aBroken || bBroken)                                                                                         // L7580
                {
                    double diff = wd.scoreA - wd.scoreB;                                                                          // L7581-7584
                    var winner = diff >= 0 ? ca : cb;
                    var loser = diff >= 0 ? cb : ca;
                    bool brokenIsLoser = diff >= 0 ? bBroken : aBroken;
                    if (brokenIsLoser && w.Rng() < 0.5)                                                                           // L7585
                    {
                        // 弱势方崩溃 → 屈膝割地求和
                        w.AddEvent("collapse", $"「{loser.name}」民穷财尽、无力支撑战事，被迫屈膝求和", loser.colorHex);                    // L7587-7588
                        int cap = wd.reason == "border" ? System.Math.Max(6, wd.goal) : wd.reason == "plunder" || wd.reason == "revenge" ? 10 : 40;
                        ConcludeByScore(w, winner, loser, cap);                                                                    // L7589
                    }
                    else if (w.Rng() < 0.4)                                                                                       // L7590
                    {
                        // 占优方虚耗崩溃 / 双方两败俱伤 → 白平
                        w.AddEvent("collapse", $"「{winner.name}」久战虚耗，国力难以为继，战争无果而终", winner.colorHex);                    // L7592-7593
                        WbCivSim.MakePeace(w, ca.id, cb.id, $"「{ca.name}」与「{cb.name}」两败俱伤，民疲兵乏，罢战言和", 5);
                    }
                    continue;                                                                                                 // L7595
                }
                // —— ④ 劳师糜饷：战线长期沉寂 → 财政枯竭式罢兵 ——
                if (w.tickCount - wd.lastActiveTick > 950)                                                                       // L7598
                {
                    WbCivSim.MakePeace(w, ca.id, cb.id, $"「{ca.name}」与「{cb.name}」劳师糜饷、战线久无战事，罢兵息战", 10);                    // L7599
                    continue;                                                                                                 // L7600
                }
                // —— ⑤ 战争世代期限（Task 36 软化）：厌战概率逐轮攀升的有机罢兵 ——
                long warLen = w.tickCount - wd.startTick;                                                                       // L7603
                if (!wd.total && warLen > 1800 && w.Rng() < System.Math.Min(0.4, (warLen - 1800) / 1500.0))                          // L7604
                {
                    WbCivSim.MakePeace(w, ca.id, cb.id, $"「{ca.name}」与「{cb.name}」的战争跨越世代仍未分出胜负——师老兵疲，两国罢兵", 8);            // L7605
                    continue;                                                                                                 // L7606
                }
            }
        }

        /// <summary>engine concludeByScore L7672-7708 —— 割地和约：败方割让与胜方接壤的边境领土（按战争理由定上限）+ 建筑随土易帜</summary>
        public static void ConcludeByScore(WbWorld w, WbCiv winner, WbCiv loser, int maxTiles = 40)
        {
            int ceded = 0;                                                                                                 // L7673
            var newTiles = new List<int>();                                                                                 // L7674
            for (int i = 0; i < loser.tiles.Count; i++)                                                                     // L7675（for...of 值序——败方 tiles 注入序）
            {
                if (ceded >= maxTiles) break;                                                                               // L7676
                int t = loser.tiles[i];
                if (w.owner[t] != loser.id) continue;                                                                       // L7677
                if (!TouchesOwner(w, t, winner.id)) continue;                                                                // L7678
                w.owner[t] = (short)winner.id;                                                                              // L7679-7682
                newTiles.Add(t);
                w.MarkDirty(t);
                ceded++;
            }
            if (ceded > 0)                                                                                                 // L7684
            {
                loser.tiles = loser.tiles.Where(t => w.owner[t] != winner.id || !newTiles.Contains(t)).ToList();                // L7685
                winner.tiles.AddRange(newTiles);                                                                            // L7686
                // 割地上建筑易帜
                foreach (int t in newTiles)                                                                                 // L7688
                {
                    if (w.building[t] > 0)
                    {
                        int bi = w.bIdx.TryGetValue(t, out var bv) ? bv : -1;                                                // L7690（get → undefined）
                        var b = bi >= 0 && bi < w.buildings.Count ? w.buildings[bi] : null;                                   // L7691
                        if (b != null && b.civ == loser.id)                                                                   // L7692
                        {
                            if (Capturable.Contains(b.kind))                                                                  // L7693
                            {
                                b.civ = winner.id;                                                                            // L7694-7697
                                loser.houses--;
                                winner.houses++;
                                w.BhpSet(t, WbCivSim.BUILDING_DEFS[b.kind].hp);
                            }
                            else
                            {
                                WbCivSim.DestroyBuilding(w, t);                                                               // L7699（swap-pop 全账——译件复用）
                            }
                        }
                    }
                }
                if (w.overlayMode == "political" || w.overlayMode == "alliance") w.overlayDirty = true;                           // L7704
            }
            WbCivSim.MakePeace(w, winner.id, loser.id, $"「{loser.name}」战败求和，向「{winner.name}」割让 {ceded} 格领土{(ceded > 0 ? "，城头变幻大王旗" : "")}", 10);   // L7706
            w.AddEvent("cession", $"「{loser.name}」割地 {ceded} 格予「{winner.name}」，城头变幻大王旗", winner.colorHex);                  // L7707
        }

        /// <summary>engine touchesOwner L7711-7719 —— tile 是否与 civ 领土接壤</summary>
        public static bool TouchesOwner(WbWorld w, int t, int civId)
        {
            int x = t % WbWorld.W;                                                                                         // L7712-7713
            int y = t / WbWorld.W;
            if (x > 0 && w.owner[t - 1] == civId) return true;                                                              // L7714
            if (x < WbWorld.W - 1 && w.owner[t + 1] == civId) return true;                                                    // L7715
            if (y > 0 && w.owner[t - WbWorld.W] == civId) return true;                                                        // L7716
            if (y < WbWorld.H - 1 && w.owner[t + WbWorld.W] == civId) return true;                                            // L7717
            return false;                                                                                                 // L7718
        }
    }
}
