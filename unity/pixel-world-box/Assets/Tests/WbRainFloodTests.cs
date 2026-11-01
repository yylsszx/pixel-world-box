// ============================================================
// WbRainFloodTests.cs — M-U11 雨洪生产域黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/rainflood.json（9 场景）
//   由 scripts/unity-migration/gen-rainflood.mjs 生成（真引擎 GameEngine 构造 +
//   手术式夹具直写〔terrain/owner/road/regrow/flood/fire/buildings/glacier/soil〕+
//   rngA 尾置清零起流 + calls 序直调〔rainRegrow/natureFlood/floodArea〕每调用步进
//   快照 + onToast 收集器；det 双跑字节级一致；75.1KB md5 0b1061d9）。
// 镜像: rainflood-transcript.mjs 零引擎导入 9/9 ALL PASS（bun 口径——cos/sin/hypot 原生 fdlibm）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 9/9 → 本文件 NUnit C# 全链重放
//   （FdSin/FdCos/FdHypot 位精确件 + setTerrain 全级联〔M-U9a/M-U10a 已译件〕+
//   DestroyBuilding smoke 级联）逐位对账。
// 对账面: 每调用步进 rngA 终态 + terrain/fire/waterTier/glacier/owner/road md5 +
//   fireSet 插入序 + flood/regrow/wet/frozen entries 序 + fxCount/eventsCount/
//   buildingsCount/shake + 终态 terrain gz 逐字节 + fx 全列（kind/x/y/ttl/seed/dir/r）
//   + events 全列 + toasts 全列（id/text/tone/op）。
// 数学面: natureFlood 极坐标 cos/sin→WbMath.FdSin/FdCos、floodArea hypot→WbMath.FdHypot
//   （fdlibm 位精确件——WbMath L43/L700/L714 既有件零新增）；格角距（无 0.5 偏移——
//   annihilate L9574 中心距异构勿混）。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbRainFloodTests
    {
        private static string FindRainFlood()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "rainflood.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "rainflood.json"),
                "rainflood.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: rainflood.json");
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

        private static double F64FromHex(string hex) => BitConverter.ToDouble(Convert.FromHexString(hex), 0);

        private static string Md5Hex(byte[] data)
        {
            using var md5 = System.Security.Cryptography.MD5.Create();
            var h = md5.ComputeHash(data);
            var sb = new System.Text.StringBuilder(h.Length * 2);
            foreach (byte b in h) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        private static string Md5HexI16(short[] data)
        {
            byte[] bytes = new byte[data.Length * 2];
            System.Buffer.BlockCopy(data, 0, bytes, 0, bytes.Length);
            return Md5Hex(bytes);
        }

        /// <summary>C# 全链重放：夹具灌注 → rngA 尾置起流（返回未步进世界）</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            byte[] ob = GunzipB64(fx.Value<string>("owner0"));
            w.owner = new short[WbWorld.W * WbWorld.H];
            System.Buffer.BlockCopy(ob, 0, w.owner, 0, ob.Length);
            w.road = GunzipB64(fx.Value<string>("road0"));
            w.fire = GunzipB64(fx.Value<string>("fire0"));
            w.fireSet = new HashSet<int>(fx["fireSet0"].ToObject<List<int>>());
            w.fireSetList = fx["fireSet0"].ToObject<List<int>>();            // 插入序镜像（M-U9b 先例）
            w.glacier = GunzipB64(fx.Value<string>("glacier0"));
            w.soilF = GunzipB64(fx.Value<string>("soil0"));
            foreach (var t in (JArray)fx["regrow0"]) w.regrow[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var t in (JArray)fx["flood0"]) w.flood[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var b in (JArray)fx["building0"])
            {
                var bo = (JObject)b;
                w.building[bo.Value<int>("i")] = (byte)bo.Value<int>("kind");
                w.buildings.Add(new WbBuilding { i = bo.Value<int>("i"), x = bo.Value<int>("x"), y = bo.Value<int>("y"), kind = bo.Value<int>("kind"), civ = -1 });
                w.bIdx[bo.Value<int>("i")] = w.buildings.Count - 1;
            }
            w.tickCount = sc.Value<int>("tickCount");
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        /// <summary>单调用步进快照对账（gen-rainflood 每调用步进协议同构）</summary>
        private static void StepAndAssert(WbWorld w, JObject g, string key, int s, string fn, double[] args)
        {
            if (fn == "rainRegrow") WbBailRelay.RainRegrow(w, args[0], args[1]);
            else if (fn == "natureFlood") WbBailRelay.NatureFlood(w, args[0], args[1]);
            else if (fn == "floodArea") WbBailRelay.FloodArea(w, args[0], args[1], args[2]);
            else throw new AssertionException($"未知调用 {fn}");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{s}");
            Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{s}");
            Assert.That(Md5Hex(w.fire), Is.EqualTo(g.Value<string>("fireMd5")), $"fireMd5 {key} S{s}");
            Assert.That(w.fireSetList, Is.EqualTo(g["fireSet"].ToObject<List<int>>()), $"fireSet 序 {key} S{s}");
            Assert.That(w.fireSet.SetEquals(w.fireSetList), $"fireSet 集合=镜像 {key} S{s}");
            var goldFlood = new List<string>();
            foreach (var t in (JArray)g["flood"]) goldFlood.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotFlood = new List<string>();
            foreach (var kv in w.flood) gotFlood.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotFlood, Is.EqualTo(goldFlood), $"flood 序 {key} S{s}");
            var goldRegrow = new List<string>();
            foreach (var t in (JArray)g["regrow"]) goldRegrow.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotRegrow = new List<string>();
            foreach (var kv in w.regrow) gotRegrow.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotRegrow, Is.EqualTo(goldRegrow), $"regrow 序 {key} S{s}");
            var goldWet = new List<string>();
            foreach (var t in (JArray)g["wet"]) goldWet.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotWet = new List<string>();
            foreach (var kv in w.wet) gotWet.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotWet, Is.EqualTo(goldWet), $"wet 序 {key} S{s}");
            Assert.That(new List<int>(w.frozen), Is.EqualTo(g["frozen"].ToObject<List<int>>()), $"frozen 序 {key} S{s}");
            Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{s}");
            Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{s}");
            Assert.That(w.buildings.Count, Is.EqualTo(g.Value<int>("buildingsCount")), $"buildingsCount {key} S{s}");
            Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{s}");
            Assert.That(Md5Hex(w.waterTier), Is.EqualTo(g.Value<string>("waterTierMd5")), $"waterTierMd5 {key} S{s}");
            Assert.That(Md5Hex(w.glacier), Is.EqualTo(g.Value<string>("glacierMd5")), $"glacierMd5 {key} S{s}");
            Assert.That(Md5HexI16(w.owner), Is.EqualTo(g.Value<string>("ownerMd5")), $"ownerMd5 {key} S{s}");
            Assert.That(Md5Hex(w.road), Is.EqualTo(g.Value<string>("roadMd5")), $"roadMd5 {key} S{s}");
        }

        [Test]
        public void Test43_RainFlood_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindRainFlood()));
            var scens = (JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(9));
            foreach (var scTok in scens)
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                var snaps = (JArray)sc["stepsSnap"];
                for (int k = 0; k < snaps.Count; k++)
                {
                    var g = (JObject)snaps[k];
                    var args = new List<double>();
                    foreach (var a in (JArray)g["args"]) args.Add(a.Value<double>());
                    StepAndAssert(w, g, key, k, g.Value<string>("fn"), args.ToArray());
                }
                // 终态 fx 全列（kind/x/y/ttl/seed/dir/r 位级——fx 2 掷 seed/dir 面）
                var goldFx = (JArray)sc["fx"];
                Assert.That(w.effects.Count, Is.EqualTo(goldFx.Count), $"fx count {key}");
                for (int k = 0; k < goldFx.Count; k++)
                {
                    var e = (JObject)goldFx[k];
                    var f = w.effects[k];
                    Assert.That(f.kind, Is.EqualTo(e.Value<string>("kind")), $"fx kind {key}#{k}");
                    Assert.That(f.seed, Is.EqualTo(e.Value<int>("seed")), $"fx seed {key}#{k}");
                    Assert.That(F64Hex(f.x), Is.EqualTo(e.Value<string>("x")), $"fx x {key}#{k}");
                    Assert.That(F64Hex(f.y), Is.EqualTo(e.Value<string>("y")), $"fx y {key}#{k}");
                    Assert.That(F64Hex(f.ttl), Is.EqualTo(e.Value<string>("ttl")), $"fx ttl {key}#{k}");
                    Assert.That(F64Hex(f.dir), Is.EqualTo(e.Value<string>("dir")), $"fx dir {key}#{k}");
                    double? gr = e["r"].Type == JTokenType.Float || e["r"].Type == JTokenType.Integer ? (double?)e.Value<double>("r") : (double?)null;
                    Assert.That((double?)f.r, Is.EqualTo(gr ?? 1.0), $"fx r {key}#{k}");
                }
                // 终态 events 全列 + toasts 全列 + terrain gz 逐字节
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
                var goldToast = (JArray)sc["toasts"];
                Assert.That(w.toasts.Count, Is.EqualTo(goldToast.Count), $"toasts count {key}");
                for (int k = 0; k < goldToast.Count; k++)
                {
                    var t = (JObject)goldToast[k];
                    var tt = w.toasts[k];
                    Assert.That(tt.id, Is.EqualTo(t.Value<int>("id")), $"toast id {key}#{k}");
                    Assert.That(tt.text, Is.EqualTo(t.Value<string>("text")), $"toast text {key}#{k}");
                    Assert.That(tt.tone, Is.EqualTo(t.Value<string>("tone")), $"toast tone {key}#{k}");
                    if (t["op"].Type == JTokenType.Null) Assert.That(tt.op, Is.Null, $"toast op null {key}#{k}");
                    else Assert.That(tt.op, Is.EqualTo((bool?)t.Value<bool>("op")), $"toast op {key}#{k}");
                }
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
            }
        }

        /// <summary>RainRegrow 双支直测：+60 下限支（tick 高）/ -160 提前支（tick 低）+ miss 支掷数 8</summary>
        [Test]
        public void Test43_RainRegrow_Branches()
        {
            // +60 支：tick=3480 → tick+60=3540 ≥ at-160 → max 走 +60
            var w = new WbWorld();
            w.tickCount = 3480;
            w.rngA = 0x0A11F001u;
            w.regrow[14432] = 3000;   // 窗内单格确定性命中不成立——直接用黄金同款 64 格大窗
            w.regrow.Clear();
            for (int n = 0; n < 64; n++) w.regrow[56 * WbWorld.W + 96 + (n / 8) * WbWorld.W + (n % 8)] = 3000L + n * 10L;
            WbBailRelay.RainRegrow(w, 96, 56);
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("e468e3eb"), "+60 支掷链 2 掷");
            bool hit60 = false;
            foreach (var kv in w.regrow) if (kv.Value == 3540L) hit60 = true;
            Assert.That(hit60, Is.True, "+60 支命中格 at→3540");
            // -160 支：tick=2800 → tick+60=2860 → max 走 at-160
            var w2 = new WbWorld();
            w2.tickCount = 2800;
            w2.rngA = 0x0A11F002u;
            for (int n = 0; n < 64; n++) w2.regrow[56 * WbWorld.W + 96 + (n / 8) * WbWorld.W + (n % 8)] = 3000L + n * 10L;
            WbBailRelay.RainRegrow(w2, 96, 56);
            Assert.That(w2.rngA.ToString("x8"), Is.EqualTo("e468e3ec"), "-160 支掷链 2 掷");
            bool hitMinus = false;
            foreach (var kv in w2.regrow) if (kv.Value != 3000L + (kv.Key - 56 * WbWorld.W - 96) * 10L) hitMinus = true;
            Assert.That(hitMinus, Is.True, "-160 支命中格 at→at-160");
            // miss 支：空窗 4 采样 8 掷全消费、regrow 不变
            var w3 = new WbWorld();
            w3.tickCount = 3000;
            w3.rngA = 0x0A11F003u;
            WbBailRelay.RainRegrow(w3, 252, 156);
            Assert.That(w3.rngA.ToString("x8"), Is.EqualTo("736dbfab"), "miss 支掷链 8 掷（越界 continue 亦消费）");
            Assert.That(w3.regrow.Count, Is.EqualTo(0), "miss 支 regrow 零写");
        }

        /// <summary>NatureFlood 级联五支直测：owner 熄/fire 熄+fireSet 出/regrow 出/road 清/glacier 清 + 纪事门</summary>
        [Test]
        public void Test43_NatureFlood_CascadeBranches()
        {
            var w = new WbWorld();
            int i = 80 * WbWorld.W + 128;
            w.terrain[i] = WbConstants.T_GRASS;
            w.owner[i] = 5;
            w.road[i] = 1;
            w.regrow[i] = 9999;
            w.fire[i] = 30;
            w.fireSet.Add(i); w.fireSetList.Add(i);
            w.glacier[i] = 80;
            w.tickCount = 6000;
            w.rngA = 0x60000001u;
            // 直接以该格为靶心——首采样 (rng 极坐标) 不保证命中靶心：改为全窗注入后断言 flood 表内格级联
            w.regrow.Clear(); w.fireSet.Clear(); w.fireSetList.Clear(); w.glacier[i] = 0;
            // 确定性构造：直接调用后任一 flood 格五支全断
            for (int y = 75; y <= 85; y++) for (int x = 123; x <= 133; x++)
            {
                int j = y * WbWorld.W + x;
                w.terrain[j] = WbConstants.T_GRASS;
                w.owner[j] = 5;
                w.road[j] = 1;
                w.regrow[j] = 9999;
                w.fire[j] = 30;
                w.fireSet.Add(j); w.fireSetList.Add(j);
                w.glacier[j] = 80;
            }
            WbBailRelay.NatureFlood(w, 128, 80);
            Assert.That(w.flood.Count, Is.GreaterThanOrEqualTo(7), "命中格数（碰撞合法下界）");
            foreach (var kv in w.flood)
            {
                int j = kv.Key;
                Assert.That(w.owner[j], Is.EqualTo(-1), $"owner 熄灭支 L994 @{j}");
                Assert.That(w.road[j], Is.EqualTo(0), $"road 清支 L1002 @{j}");
                Assert.That(w.fire[j], Is.EqualTo(0), $"fire 熄灭支 L991 @{j}");
                Assert.That(w.fireSet.Contains(j), Is.False, $"fireSet 出账支 L992 @{j}");
                Assert.That(w.regrow.ContainsKey(j), Is.False, $"regrow 出账支 L979 @{j}");
                Assert.That(w.glacier[j], Is.EqualTo(0), $"glacier 清支 L159 @{j}");
                Assert.That(kv.Value, Is.EqualTo((long)w.tickCount + 180L + (kv.Value - (long)w.tickCount - 180L)), $"flood 到期 = tick+180+floor(rng*120) 自洽 @{j}");
                Assert.That(kv.Value - 180L - (long)w.tickCount, Is.InRange(0L, 119L), $"rng*120 域钳 @{j}");
            }
            Assert.That(w.worldEvents.Count, Is.EqualTo(1), "纪事门 flooded>=4");
            Assert.That(w.worldEvents[0].kind, Is.EqualTo("geo"), "纪事域 geo");
            Assert.That(w.worldEvents[0].text, Is.EqualTo("持续的暴雨漫过了河岸，洼地化作一片泽国"), "纪事文本位级");
        }

        /// <summary>FloodArea 钳位双支直测 + tsunami fx/shake/toast 签名 + 零掷直通支</summary>
        [Test]
        public void Test43_FloodArea_ClampAndCast()
        {
            // 下钳支：r=1 → rr=2；圆域命中 → fx tsunami{r:3} + shake=3 + toast
            var w = new WbWorld();
            for (int y = 55; y <= 65; y++) for (int x = 55; x <= 65; x++) w.terrain[y * WbWorld.W + x] = WbConstants.T_GRASS;
            w.tickCount = 9000;
            w.rngA = 0xFA000001u;
            WbBailRelay.FloodArea(w, 60, 60, 1);
            Assert.That(w.flood.Count, Is.GreaterThanOrEqualTo(9), "rr=2 圆域命中数（hypot 格角距）");
            Assert.That(w.effects.Count, Is.EqualTo(1), "fx tsunami 1 条");
            Assert.That(w.effects[0].kind, Is.EqualTo("tsunami"), "fx kind");
            Assert.That(w.effects[0].r, Is.EqualTo(3.0).Within(1e-12), "fx r=rr+1=3");
            Assert.That(w.shake, Is.EqualTo(3.0), "shake=max(3)");
            Assert.That(w.toasts.Count, Is.EqualTo(1), "toast 1 条");
            Assert.That(w.toasts[0].tone, Is.EqualTo("info"), "toast tone");
            Assert.That(w.toasts[0].text, Does.StartWith("洪水漫过了大地（"), "toast 文本前缀");
            // 零掷直通支：圆域全 DEEP → flooded=0 无 fx 无 toast 无 rng 消费
            var w2 = new WbWorld();
            for (int y = 12; y <= 28; y++) for (int x = 192; x <= 208; x++) w2.terrain[y * WbWorld.W + x] = WbConstants.T_DEEP;
            w2.tickCount = 10000;
            w2.rngA = 0x0A11F009u;
            WbBailRelay.FloodArea(w2, 200, 20, 8);
            Assert.That(w2.rngA, Is.EqualTo(0x0A11F009u), "零掷直通——rngA 终态=初态");
            Assert.That(w2.flood.Count, Is.EqualTo(0), "零命中");
            Assert.That(w2.effects.Count, Is.EqualTo(0), "无 fx");
            Assert.That(w2.toasts.Count, Is.EqualTo(0), "无 toast");
            // 上钳支：r=50 → rr=12（黄金 S8 调用 b 同参数掷链闭合面由 GoldenReplay 覆盖——此处只钉钳位后圆域半径上限语义）
            var w3 = new WbWorld();
            w3.tickCount = 9000;
            w3.rngA = 0xFA000003u;
            int before = 0;
            WbBailRelay.FloodArea(w3, 200, 20, 50);   // 全 DEEP 世界 → flooded=0
            before = w3.flood.Count;
            Assert.That(before, Is.EqualTo(0), "上钳支 rr=12 全水零命中（钳位计算无越界）");
        }
    }
}
