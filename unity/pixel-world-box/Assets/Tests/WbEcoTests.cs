// ============================================================
// WbEcoTests.cs — M-U12 ecoTick 生态承载域黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/eco.json（12 场景）
//   由 scripts/unity-migration/gen-eco.mjs 生成（真引擎 GameEngine 构造 +
//   手术式夹具直写〔terrain/owner/regrow/buildings/soil/units 瘦直写 + eco 三态字段〕+
//   rngA 尾置清零起流 + calls 序直调〔ecoTick〕每调用步进快照；det 双跑字节级一致；
//   134.4KB md5 69c445aa）。蓝本 engine.ts ecoTick L12096-12202 六段 + 迁徙双支。
// 镜像: eco-transcript.mjs 零引擎导入 12/12 ALL PASS（bun 口径；红证：禁啃食门
//   8 场景 rngA 漂移 FAIL → 还原复绿——向量有效触达啃食掷流实证）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 12/12 → 本文件 NUnit C# 全链重放
//   （EcoTick 全译件 + IsHerbivoreRace/IsPredatorRace + setTerrain 全级联 +
//   SpawnUnit 静默链〔trait 0.15/maxAge/flip/breath/family 0.06——骷髅先例同构〕）逐位对账。
// 对账面: 步进 rngA/terrainMd5/grassTiles/preyGridMd5〔Uint16 LE 字节面〕/ecoState/
//   regrow entries 序/eventsCount/fxCount/unitsCount + 终态 terrain gz 逐字节 +
//   preyGrid 全列 + units dump 全字段位级（id/race/civ/x/y/tx/ty/hp/maxHp/dmg/speed/
//   age/maxAge/hurtN/dead/flip/infected/job/name/gene/fam/fgn/breath/parity/kills）+
//   events 全列（kind/text/x/y）。
// 直测面: soil 除子双面（1.4/0.6）/building 门零烧/regrow 级联出账复合语义（场外键
//   5555 保留）/fitness 最弱者/pred 竞争 2 掷/aquatic 跳过 preyGrid 全 0/冷却静默
//   else-if/25 年节流短路掷流零消费。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbEcoTests
    {
        private static string FindEco()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "eco.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "eco.json"),
                "eco.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: eco.json");
        }

        private static byte[] GunzipB64(string b64)
        {
            byte[] raw = Convert.FromBase64String(b64);
            using var ms = new System.IO.MemoryStream(raw);
            using var gz = new System.IO.Compression.GZipStream(ms, System.IO.Compression.CompressionMode.Decompress);
            using var outMs = new System.IO.MemoryStream();
            gz.CopyTo(outMs);
            return outMs.ToArray();
        }

        private static string F64Hex(double v) => WbRender.F64Hex(v);   // 小写 16 字符 LE —— JS f64hex 同构

        private static string Md5Hex(byte[] data)
        {
            using var md5 = System.Security.Cryptography.MD5.Create();
            var h = md5.ComputeHash(data);
            var sb = new System.Text.StringBuilder(h.Length * 2);
            foreach (byte b in h) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        /// <summary>preyGrid md5 —— JS md5hex(Buffer.from(Uint16Array.buffer))：640 元素 Uint16 LE 字节面</summary>
        private static string PreyGridMd5U16(int[] g)
        {
            byte[] b = new byte[g.Length * 2];
            for (int i = 0; i < g.Length; i++) { b[i * 2] = (byte)(g[i] & 0xff); b[i * 2 + 1] = (byte)((g[i] >> 8) & 0xff); }
            return Md5Hex(b);
        }

        /// <summary>瘦单位直写（gen-eco mkUnit 协议同构：civ=-1/speed=1/dmg=1/maxAge=9999/name=u{id}/hurt=0/breath=0/job=0）</summary>
        private static void MkUnit(WbWorld w, JObject uo)
        {
            int id = uo.Value<int>("id");
            double hp = uo.Value<double?>("hp") ?? 10.0;
            var u = new WbU
            {
                id = id,
                race = uo.Value<int>("race"),
                civ = -1,
                x = uo.Value<double>("x"), y = uo.Value<double>("y"),
                tx = uo.Value<double>("x"), ty = uo.Value<double>("y"),
                hp = hp, maxHp = hp, dmg = 1, speed = 1,
                ageF = 0, maxAgeF = 9999.0, kills = 0,
                jobC = 0,                       // TS mkUnit job: o.job ?? 0
                name = "u" + id,
                hurtN = 0.0,                    // TS hurt: o.hurt ?? 0
                breathN = 0,                    // TS breath: 0
                parity = 0,
                dead = uo.Value<int?>("dead") ?? 0,
                flip = 0, infected = 0,
                geneC = (uo["gene"] == null || uo["gene"].Type == JTokenType.Null)
                    ? null
                    : new WbGene
                    {
                        s = uo["gene"].Value<double?>("s") ?? 1.0,
                        d = uo["gene"].Value<double?>("d") ?? 1.0,
                        h = uo["gene"].Value<double?>("h") ?? 1.0,
                        r = uo["gene"].Value<double?>("r") ?? 1.0,
                    },
                famC = null, fgnC = null,
            };
            w.units.Add(u);
            w.unitById[u.id] = u;
        }

        /// <summary>C# 全链重放：gen-eco 手术一（瞬态层清零）+ 手术二（直写相）+ 手术三（rngA 起流）→ 调用方执行 ecoTick</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            // —— 手术一：瞬态层清零（gen-eco buildScenario L150-180 同构；owner 构造器已 fill(-1)）——
            Array.Clear(w.fire, 0, w.fire.Length);
            w.fireSet.Clear(); w.fireSetList.Clear();
            w.frozen.Clear(); w.flood.Clear(); w.wet.Clear(); w.regrow.Clear();
            w.units.Clear(); w.unitById.Clear();
            w.unitSeq = 1; w.familySeq = 1; w.eventSeq = 1;   // spawn id/family/事件 id 起点清零（parity=unitSeq%2 位级对齐）
            w.wildCount.Clear(); w.families.Clear();
            w.effects.Clear(); w.worldEvents.Clear();
            Array.Clear(w.building, 0, w.building.Length);
            w.buildings.Clear(); w.bIdx.Clear();
            Array.Clear(w.road, 0, w.road.Length);
            Array.Clear(w.riverDir, 0, w.riverDir.Length);
            w.riverTiles.Clear();
            Array.Clear(w.waterTier, 0, w.waterTier.Length);
            w.shake = 0;
            // —— 手术二：直写相（terrain/soil/regrow/buildings/units + eco 三态字段 + yearF/tickCount）——
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            w.soilF = GunzipB64(fx.Value<string>("soil0"));
            foreach (var t in (JArray)fx["regrow0"]) w.regrow[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var b in (JArray)fx["building0"])
            {
                var bo = (JObject)b;
                w.building[bo.Value<int>("i")] = (byte)bo.Value<int>("kind");
                w.buildings.Add(new WbBuilding { i = bo.Value<int>("i"), x = bo.Value<int>("x"), y = bo.Value<int>("y"), kind = bo.Value<int>("kind"), civ = -1 });
                w.bIdx[bo.Value<int>("i")] = w.buildings.Count - 1;
            }
            foreach (var uo in (JArray)fx["units0"]) MkUnit(w, (JObject)uo);
            w.yearF = fx.Value<double>("yearF0");             // L12177 yearNow=Math.floor(yearF)——迁徙/播报冷却双锚
            w.tickCount = sc.Value<int>("tickCount");
            w.ecoState = fx.Value<string>("ecoState0");
            w.ecoLastNoteYear = fx.Value<int>("ecoLastNoteYear0");
            w.ecoRepopYear = fx.Value<int>("ecoRepopYear0");
            // —— 手术三：rngA 尾置清零起流 ——
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        /// <summary>步进快照对账（gen-eco 每调用步进协议同构：rngA/terrainMd5/grassTiles/preyGridMd5/ecoState/regrow 序/计数五面）</summary>
        private static void StepAndAssert(WbWorld w, JObject g, string key, int s)
        {
            Assert.That(g.Value<string>("fn"), Is.EqualTo("ecoTick"), $"fn {key} S{s}");
            Assert.That(((JArray)g["args"]).Count, Is.EqualTo(0), $"args {key} S{s}");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{s}");
            Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{s}");
            Assert.That(w.grassTiles, Is.EqualTo(g.Value<int>("grassTiles")), $"grassTiles {key} S{s}");
            Assert.That(PreyGridMd5U16(w.preyGrid), Is.EqualTo(g.Value<string>("preyGridMd5")), $"preyGridMd5 {key} S{s}");
            Assert.That(w.ecoState, Is.EqualTo(g.Value<string>("ecoState")), $"ecoState {key} S{s}");
            var goldRegrow = new List<string>();
            foreach (var t in (JArray)g["regrow"]) goldRegrow.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotRegrow = new List<string>();
            foreach (var kv in w.regrow) gotRegrow.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotRegrow, Is.EqualTo(goldRegrow), $"regrow 序 {key} S{s}");
            Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{s}");
            Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{s}");
            Assert.That(w.units.Count, Is.EqualTo(g.Value<int>("unitsCount")), $"unitsCount {key} S{s}");
        }

        /// <summary>终态 units dump 全字段位级对账（gen-eco dumpUnit 协议同构）</summary>
        private static void AssertUnitsDump(WbWorld w, JArray goldUnits, string key)
        {
            Assert.That(w.units.Count, Is.EqualTo(goldUnits.Count), $"units count {key}");
            for (int k = 0; k < goldUnits.Count; k++)
            {
                var e = (JObject)goldUnits[k];
                var u = w.units[k];
                Assert.That(u.id, Is.EqualTo(e.Value<int>("id")), $"u.id {key}#{k}");
                Assert.That(u.race, Is.EqualTo(e.Value<int>("race")), $"u.race {key}#{k}");
                Assert.That(u.civ, Is.EqualTo(e.Value<int>("civ")), $"u.civ {key}#{k}");
                Assert.That(F64Hex(u.x), Is.EqualTo(e.Value<string>("x")), $"u.x {key}#{k}");
                Assert.That(F64Hex(u.y), Is.EqualTo(e.Value<string>("y")), $"u.y {key}#{k}");
                Assert.That(F64Hex(u.tx), Is.EqualTo(e.Value<string>("tx")), $"u.tx {key}#{k}");
                Assert.That(F64Hex(u.ty), Is.EqualTo(e.Value<string>("ty")), $"u.ty {key}#{k}");
                Assert.That(F64Hex(u.hp), Is.EqualTo(e.Value<string>("hp")), $"u.hp {key}#{k}");
                Assert.That(F64Hex(u.maxHp), Is.EqualTo(e.Value<string>("maxHp")), $"u.maxHp {key}#{k}");
                Assert.That(F64Hex(u.dmg), Is.EqualTo(e.Value<string>("dmg")), $"u.dmg {key}#{k}");
                Assert.That(F64Hex(u.speedN ?? u.speed), Is.EqualTo(e.Value<string>("speed")), $"u.speed {key}#{k}");
                Assert.That(F64Hex(u.ageF), Is.EqualTo(e.Value<string>("age")), $"u.age {key}#{k}");
                Assert.That(F64Hex(u.maxAgeF), Is.EqualTo(e.Value<string>("maxAge")), $"u.maxAge {key}#{k}");
                Assert.That(u.hurtN.HasValue ? F64Hex(u.hurtN.Value) : null, Is.EqualTo(e.Value<string>("hurtN")), $"u.hurtN {key}#{k}");
                Assert.That(u.dead, Is.EqualTo(e.Value<int>("dead")), $"u.dead {key}#{k}");
                Assert.That(u.flip, Is.EqualTo(e.Value<int>("flip")), $"u.flip {key}#{k}");
                Assert.That(u.infected, Is.EqualTo(e.Value<int>("infected")), $"u.infected {key}#{k}");
                Assert.That(u.jobC?.ToString() ?? null, Is.EqualTo(e["job"].Type == JTokenType.Null ? null : e.Value<int>("job").ToString()), $"u.job {key}#{k}");
                Assert.That(u.name, Is.EqualTo(e.Value<string>("name")), $"u.name {key}#{k}");
                if (e["gene"] == null || e["gene"].Type == JTokenType.Null)
                    Assert.That(u.geneC, Is.Null, $"u.gene null {key}#{k}");
                else
                {
                    Assert.That(u.geneC, Is.Not.Null, $"u.gene nonnull {key}#{k}");
                    Assert.That(F64Hex(u.geneC.s), Is.EqualTo(e["gene"].Value<string>("s")), $"u.gene.s {key}#{k}");
                    Assert.That(F64Hex(u.geneC.d), Is.EqualTo(e["gene"].Value<string>("d")), $"u.gene.d {key}#{k}");
                    Assert.That(F64Hex(u.geneC.h), Is.EqualTo(e["gene"].Value<string>("h")), $"u.gene.h {key}#{k}");
                    Assert.That(F64Hex(u.geneC.r), Is.EqualTo(e["gene"].Value<string>("r")), $"u.gene.r {key}#{k}");
                }
                Assert.That(u.famC?.ToString() ?? null, Is.EqualTo(e["fam"].Type == JTokenType.Null ? null : e.Value<int>("fam").ToString()), $"u.fam {key}#{k}");
                Assert.That(u.fgnC?.ToString() ?? null, Is.EqualTo(e["fgn"].Type == JTokenType.Null ? null : e.Value<int>("fgn").ToString()), $"u.fgn {key}#{k}");
                Assert.That(u.breathN?.ToString() ?? null, Is.EqualTo(e["breath"].Type == JTokenType.Null ? null : e.Value<int>("breath").ToString()), $"u.breath {key}#{k}");
                Assert.That(u.parity.ToString(), Is.EqualTo(e["parity"].Type == JTokenType.Null ? null : e.Value<int>("parity").ToString()), $"u.parity {key}#{k}");
                Assert.That(u.kills.ToString(), Is.EqualTo(e["kills"].Type == JTokenType.Null ? null : e.Value<int>("kills").ToString()), $"u.kills {key}#{k}");
            }
        }

        [Test]
        public void Test44_Eco_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindEco()));
            var scens = (JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(12));
            foreach (var scTok in scens)
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                WbBailRelay.EcoTick(w);                                  // 单调用步进（ecoTick 无参）
                var snaps = (JArray)sc["stepsSnap"];
                for (int k = 0; k < snaps.Count; k++) StepAndAssert(w, (JObject)snaps[k], key, k);
                // 终态：terrain gz 逐字节 + grassTiles + preyGrid 全列 + eco 三态字段 + regrow 序
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
                Assert.That(w.grassTiles, Is.EqualTo(sc.Value<int>("grassTiles")), $"grassTiles 终态 {key}");
                var goldPrey = sc["preyGrid"].ToObject<List<int>>();
                Assert.That(w.preyGrid.Length, Is.EqualTo(goldPrey.Count), $"preyGrid 长度 {key}");
                for (int k = 0; k < goldPrey.Count; k++)
                    if (w.preyGrid[k] != goldPrey[k]) Assert.Fail($"preyGrid[{k}] {key}: {w.preyGrid[k]} ≠ {goldPrey[k]}");
                Assert.That(w.ecoState, Is.EqualTo(sc.Value<string>("ecoState")), $"ecoState 终态 {key}");
                Assert.That(w.ecoLastNoteYear, Is.EqualTo(sc.Value<int>("ecoLastNoteYear")), $"ecoLastNoteYear {key}");
                Assert.That(w.ecoRepopYear, Is.EqualTo(sc.Value<int>("ecoRepopYear")), $"ecoRepopYear {key}");
                var goldRegrow = new List<string>();
                foreach (var t in (JArray)sc["regrow"]) goldRegrow.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
                var gotRegrow = new List<string>();
                foreach (var kv in w.regrow) gotRegrow.Add($"{kv.Key}:{kv.Value}");
                Assert.That(gotRegrow, Is.EqualTo(goldRegrow), $"regrow 终态序 {key}");
                // 终态 units dump 全字段位级 + events 全列
                AssertUnitsDump(w, (JArray)sc["units"], key);
                var goldEv = (JArray)sc["events"];
                Assert.That(w.worldEvents.Count, Is.EqualTo(goldEv.Count), $"events count {key}");
                for (int k = 0; k < goldEv.Count; k++)
                {
                    var e = (JObject)goldEv[k];
                    var ev = w.worldEvents[k];
                    Assert.That(ev.kind, Is.EqualTo(e.Value<string>("kind")), $"ev kind {key}#{k}");
                    Assert.That(ev.text, Is.EqualTo(e.Value<string>("text")), $"ev text {key}#{k}");
                    if (e["x"].Type == JTokenType.Null) Assert.That(ev.x, Is.Null, $"ev x null {key}#{k}");
                    else Assert.That(ev.x, Is.EqualTo(e.Value<double>("x")), $"ev x {key}#{k}");
                    if (e["y"].Type == JTokenType.Null) Assert.That(ev.y, Is.Null, $"ev y null {key}#{k}");
                    else Assert.That(ev.y, Is.EqualTo(e.Value<double>("y")), $"ev y {key}#{k}");
                }
            }
        }

        /// <summary>过度啃食 soil 除子双面直测（soil255→1.4 / soil0→0.6 regrow 位级）+ building 门零烧 + regrow 级联出账复合语义</summary>
        [Test]
        public void Test44_Eco_GrazeBurn_SoilGate()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindEco()));
            // —— S4 soil=255 面：soilMul=0.6+255/255*0.8=1.4 除子；gi=idx(120,60)=15480 → regrow 2249 黄金位级 ——
            var w = ReplayScenario((JObject)gold["scenarios"].First(s => s.Value<string>("key") == "eco-graze-burn-soil255"));
            int gi = 60 * WbWorld.W + 120;
            WbBailRelay.EcoTick(w);
            Assert.That(w.terrain[gi], Is.EqualTo(WbConstants.T_BURNT), "S4 gi 烧地");
            Assert.That(w.grassTiles, Is.EqualTo(4), "S4 grassTiles=4（2×2 草格 −1 烧格）");
            Assert.That(w.regrow.ContainsKey(gi) && w.regrow[gi] == 2249L, Is.True, $"S4 regrow[gi]=2249 位级（1000+round((910+rng*900)/1.4)）got {(w.regrow.TryGetValue(gi, out long v4) ? v4 : -1)}");
            Assert.That(w.ecoState, Is.EqualTo("overgraze"), "S4 overgraze 播报态");
            Assert.That(w.worldEvents.Count, Is.EqualTo(1), "S4 播报单条");
            Assert.That(w.worldEvents[0].text.Contains("8/6"), Is.True, "S4 播报文本 8/6（herb/round(capacity)）");
            // —— S5 soil=0 面：soilMul=0.6 除子（同 seed 同羊群——除子差异位级） ——
            var w2 = ReplayScenario((JObject)gold["scenarios"].First(s => s.Value<string>("key") == "eco-graze-burn-soil0"));
            WbBailRelay.EcoTick(w2);
            Assert.That(w2.terrain[gi], Is.EqualTo(WbConstants.T_BURNT), "S5 gi 烧地");
            Assert.That(w2.regrow.TryGetValue(gi, out long v5) && v5 > 2249L, Is.True, $"S5 除子 0.6 → at 更大（{v5} > 2249 除子反比位级）");
            // —— S6 building 门：GRASS 过但 building!=0 → 不烧不 setTerrain、regrow 零写 ——
            var w3 = ReplayScenario((JObject)gold["scenarios"].First(s => s.Value<string>("key") == "eco-graze-buildingGate"));
            WbBailRelay.EcoTick(w3);
            Assert.That(w3.terrain[gi], Is.EqualTo(WbConstants.T_GRASS), "S6 building 门零烧");
            Assert.That(w3.regrow.Count, Is.EqualTo(0), "S6 regrow 零写");
            // —— S7 regrow 级联出账复合语义：预置 gi=1100 → 烧地级联 delete → has 门 false → 重设新值；
            //     场外键 idx(130,70)=5555 原值保留（出账域精确性——L979 只删 gi） ——
            var w4 = ReplayScenario((JObject)gold["scenarios"].First(s => s.Value<string>("key") == "eco-graze-regrowGate"));
            int gi2 = 70 * WbWorld.W + 130;
            Assert.That(w4.regrow[gi], Is.EqualTo(1100L), "S7 预置 gi=1100");
            WbBailRelay.EcoTick(w4);
            Assert.That(w4.terrain[gi], Is.EqualTo(WbConstants.T_BURNT), "S7 gi 烧地");
            Assert.That(w4.regrow.TryGetValue(gi, out long v7) && v7 == 2054L, Is.True, $"S7 级联出账后重设 2054 黄金位级（1000+round((910+floor(rng*900))/1.4)）got {v7}");
            Assert.That(w4.regrow.TryGetValue(gi2, out long v7b) && v7b == 5555L, Is.True, "S7 场外键 5555 原值保留");
            Assert.That(string.Join(",", w4.regrow.Select(kv => $"{kv.Key}:{kv.Value}")), Is.EqualTo("18050:5555,15480:2054"), "S7 regrow 枚举序 ≡ JS Map 删后重插末尾（重建对齐——M-U12 序语义红证清偿）");
        }

        /// <summary>竞争性饥饿 fitness 最弱者直测 + 捕食者竞争 2 掷/aquatic 跳过 preyGrid 全 0</summary>
        [Test]
        public void Test44_Eco_StarveFitness_PredComp()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindEco()));
            // —— S3 fitness 面：3 羊 gene h 0.5/缺省/2 → starve=ceil(3*0.2)=1 轮 3 采样，最弱 fitness=h*s 先倒下 ——
            var w = ReplayScenario((JObject)gold["scenarios"].First(s => s.Value<string>("key") == "eco-starve-fitness"));
            WbBailRelay.EcoTick(w);
            int hurtCnt = 0;
            WbU victim = null;
            foreach (var u in w.units) if (u.hurtN.HasValue && u.hurtN.Value == 20.0) { hurtCnt++; victim = u; }
            Assert.That(hurtCnt, Is.EqualTo(1), "S3 starve=1 单饿殍");
            Assert.That(victim, Is.Not.Null, "S3 victim 存在");
            Assert.That(F64Hex(victim.hp), Is.EqualTo("00000000000014c0"), $"S3 hp=-5.0（10-15 位级）got {F64Hex(victim.hp)}");
            Assert.That(victim.id, Is.EqualTo(21), "S3 victim=id21（gene h0.5 最弱 fitness——3 采样最弱者胜出）");
            // —— S8 pred 竞争：6 狼 + 鱼/鲨 aquatic 跳过 → predCap=0、len 6>4 → 2 狼挨打 hp-14；
            //     preyGrid 全 0（水生不入陆地账本）+ grass=0 → collapse 播报 ——
            var w2 = ReplayScenario((JObject)gold["scenarios"].First(s => s.Value<string>("key") == "eco-pred-comp"));
            WbBailRelay.EcoTick(w2);
            int predHurt = 0;
            foreach (var u in w2.units) if (u.hurtN.HasValue && u.hurtN.Value == 20.0 && u.race == WbConstants.R_WOLF) predHurt++;
            foreach (var u in w2.units) if (u.race == WbConstants.R_WOLF && (u.hurtN ?? 0) == 20.0) Assert.That(u.hp, Is.EqualTo(10.0 - 14.0), "S8 hp-14 位级");
            Assert.That(predHurt, Is.EqualTo(2), "S8 starve=min(8,ceil(6*0.25))=2 狼挨打");
            Assert.That(w2.worldEvents.Count, Is.EqualTo(1), "S8 播报单条");
            bool preyNonZero = false;
            foreach (int v in w2.preyGrid) if (v != 0) { preyNonZero = true; break; }
            Assert.That(preyNonZero, Is.False, "S8 preyGrid 全 0（鱼/鲨 aquatic 跳过 L12115）");
            Assert.That(w2.ecoState, Is.EqualTo("collapse"), "S8 herb=0<8 collapse 播报");
            Assert.That(w2.worldEvents.Count, Is.EqualTo(1), "S8 播报单条");
            Assert.That(w2.worldEvents[0].text.Contains("崩溃"), Is.True, "S8 collapse 文本");
        }

        /// <summary>状态播报冷却静默切换直测 + 迁徙 25 年节流短路（双支零掷零写）</summary>
        [Test]
        public void Test44_Eco_NoteSilent_RepopThrottle()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindEco()));
            // —— S12 冷却静默：ecoState0=overgrass + ecoLastNoteYear=2（yearF=2.5 → 0≤15 冷却）→
            //     nextState=overgraze ≠ ecoState 但冷却中 → else-if L12172 静默切换零事件 ——
            var w = ReplayScenario((JObject)gold["scenarios"].First(s => s.Value<string>("key") == "eco-note-silent"));
            WbBailRelay.EcoTick(w);
            Assert.That(w.ecoState, Is.EqualTo("overgraze"), "S12 静默切换终态 overgraze");
            Assert.That(w.worldEvents.Count, Is.EqualTo(0), "S12 冷却中零事件");
            Assert.That(w.ecoLastNoteYear, Is.EqualTo(2), "S12 冷却锚不动（未走 L12163 写面）");
            // —— 25 年节流短路直测：ecoRepopYear0=yearNow-5（≤25 门 false）→ a/b 双支零掷零写；
            //     对照黄金 S10（ecoRepopYear0=-999 → 门 true → 46 掷 spawn 5 只 + repop 写入 2） ——
            var w2 = ReplayScenario((JObject)gold["scenarios"].First(s => s.Value<string>("key") == "eco-repop-herb"));
            w2.ecoRepopYear = 0;                     // yearNow=2 → 2-0=2 ≤ 25 → 节流
            uint rngBefore = w2.rngA;
            WbBailRelay.EcoTick(w2);
            Assert.That(w2.units.Count, Is.EqualTo(2), "节流支零 spawn（2 夹具不变）");
            Assert.That(w2.ecoRepopYear, Is.EqualTo(0), "节流锚零写");
            Assert.That(w2.worldEvents.Count, Is.EqualTo(1), "节流支仅 collapse 播报（herb=2<8）——迁徙事件零发");
            Assert.That(w2.rngA, Is.EqualTo(rngBefore), "节流支零掷位证（25 年门短路——a 支 rng<0.35 门不进、饥饿/哨食不进、播报零掷）");
            // 黄金对照：S10 全链 spawn 面（同夹具同 seed，节流开闸 → 46 掷 spawn 5 只）
            var w3 = ReplayScenario((JObject)gold["scenarios"].First(s => s.Value<string>("key") == "eco-repop-herb"));
            WbBailRelay.EcoTick(w3);
            Assert.That(w3.units.Count, Is.EqualTo(7), "S10 2 夹具 + 5 spawn");
            Assert.That(w3.ecoRepopYear, Is.EqualTo(2), "S10 repop 写入 yearNow=2");
            Assert.That(w3.rngA, Is.Not.EqualTo(rngBefore), "S10 与节流世界 rng 终态分离（a 支门+采样+spawn 掷流位证）");
            Assert.That(w3.worldEvents.Count, Is.EqualTo(2), "S10 迁徙+collapse 双事件");
            Assert.That(w3.worldEvents[0].text.Contains("绵羊"), Is.True, "S10 迁徙事件文本位级（unshift 头部）");
        }
    }
}
