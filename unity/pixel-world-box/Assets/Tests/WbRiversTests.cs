// ============================================================
// WbRiversTests.cs — M-U7k 河域黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/rivers.json（5 场景）
//   由 scripts/unity-migration/gen-rivers.mjs 生成（真引擎 GameEngine 全链 generate(seed)
//   L771-952 + rngA 掷值链纯数学重建 + seedRivers 状态锚分割；det 双跑字节级一致）。
// 验证链（纪律④）: 黄金向量(真引擎) → rivers-transcript.mjs 零引擎导入镜像 5/5 → 本文件
//   NUnit C# 全链重放（GenerateWorld pre-river 锁 + SoilInit + spawnUnit 重放 + SeedRivers +
//   RebuildWaterTiers）逐位对账 → 网页 parity。
// 对账面: terrain/riverDir/waterTier 逐字节 + riverTiles 插入序 + w.rngA 终态抽签台账 +
//   units 摘要（SHA256 规范串）+ unit0 锚点 + fx(kind/seed/dir) + worldEvents(kind/text)。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using System.Text;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbRiversTests
    {
        private static string FindRivers()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "rivers.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "rivers.json"),
                "rivers.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: rivers.json");
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

        private static string F64Hex(double v) => WbRender.F64Hex(v);   // 小写 16 字符 LE —— JS f64hex 同构（gen 脚本同款）

        private static string Sha256Hex(string s)
        {
            using var sha = System.Security.Cryptography.SHA256.Create();
            var h = sha.ComputeHash(Encoding.UTF8.GetBytes(s));
            var sb = new StringBuilder(h.Length * 2);
            foreach (byte b in h) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        /// <summary>units 摘要规范串（gen-rivers.mjs canon 同构：id|race|x|y|dmg|speed|maxAge|flip|breath|name|trait|gs|gd|gh|gr 以 ';' 连接）</summary>
        private static string UnitsCanonical(List<WbU> units)
        {
            var parts = new List<string>(units.Count);
            foreach (var u in units)
            {
                parts.Add(string.Join("|",
                    u.id, u.race, F64Hex(u.x), F64Hex(u.y), F64Hex(u.dmg), F64Hex(u.speed), F64Hex(u.maxAgeF),
                    u.flip, u.breath, u.name, u.traitName ?? "",
                    F64Hex(u.geneC?.s ?? 1), F64Hex(u.geneC?.d ?? 1), F64Hex(u.geneC?.h ?? 1), F64Hex(u.geneC?.r ?? 1)));
            }
            return string.Join(";", parts);
        }

        /// <summary>C# 全链重放：GenerateWorld → SoilInit → rngA 起流 → spawnUnit 重放 → SeedRivers → RebuildWaterTiers</summary>
        private static (WbWorld w, byte[] terrain, byte[] waterTier) ReplayChain(int seed, Newtonsoft.Json.Linq.JObject sc)
        {
            var w = new WbWorld();
            var gen = WbWorldgen.GenerateWorld(seed);
            // pre-river 锁（genWorld 输出 = 蓝本 generate L776-777 前域——rivers 黄金 preTerrain 交叉扩展 worldgen 锁）
            CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("preTerrain")), gen.Terrain, $"pre-river terrain S{seed}");
            WbWorldgen.SoilInit(gen.Terrain, w.soilF);                                              // worldsim initFromTerrain L125 段
            w.rngA = (uint)(seed ^ unchecked((int)0x9e3779b9u));                                    // engine.ts L773（JS (seed ^ 0x9e3779b9)>>>0 位型同构）
            w.unitSeq = 1; w.toastSeq = 1; w.eventSeq = 1;                                          // L919-924 计数器重置段（unitSeq 初值 1——unit0.id=1 对账）
            foreach (var a in gen.SpawnAnimals)                                                     // L936 spawnUnit 逐只（M-U3h 译件）
                WbBailRelay.SpawnUnit(w, a.Race, a.X, a.Y, new WbBailRelay.WbSpawnOpts { silent = true });
            WbWorldgen.SeedRivers(w, gen.Terrain, gen.Moist, seed);                                 // L941 nature.seedRivers（M-U7k 译件）
            var wt = new byte[WbWorld.W * WbWorld.H];
            WbWorldgen.RebuildWaterTiers(gen.Terrain, wt);                                          // L949 post-river 全量
            return (w, gen.Terrain, wt);
        }

        [Test]
        public void Test29_Rivers_FullChain_GoldenReplay()
        {
            var gold = Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText(FindRivers()));
            var scens = (Newtonsoft.Json.Linq.JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(5));
            foreach (var scTok in scens)
            {
                var sc = (Newtonsoft.Json.Linq.JObject)scTok;
                int seed = sc.Value<int>("seed");
                var (w, terrain, waterTier) = ReplayChain(seed, sc);

                // ① 抽签台账终态（engine rngA uint hex——掷数序列闭合的强对账）
                Assert.That(w.rngA.ToString("x8"), Is.EqualTo(sc.Value<string>("rngA")), $"rngA S{seed}");
                // ② 对账面全图场逐字节
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), terrain, $"post-river terrain S{seed}");
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("riverDir")), w.riverDir, $"riverDir S{seed}");
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("waterTier")), waterTier, $"waterTier S{seed}");
                // ③ riverTiles 插入序（JS Set 迭代序同构）
                var goldTiles = new List<int>(sc["riverTiles"].ToObject<List<int>>());
                Assert.That(w.riverTilesList, Is.EqualTo(goldTiles), $"riverTiles S{seed}");
                Assert.That(w.riverTiles.SetEquals(goldTiles), $"riverTiles set S{seed}");
                // ④ units 摘要（SHA256 规范串——全列表位级回归面）+ 数量 + unit0 锚点
                Assert.That(w.units.Count, Is.EqualTo(sc.Value<int>("unitsCount")), $"unitsCount S{seed}");
                var u0 = (Newtonsoft.Json.Linq.JObject)sc["unit0"];
                var first = w.units[0];
                Assert.That(first.id, Is.EqualTo(u0.Value<int>("id")), $"unit0.id S{seed}");
                Assert.That(first.race, Is.EqualTo(u0.Value<int>("race")), $"unit0.race S{seed}");
                Assert.That(F64Hex(first.x), Is.EqualTo(u0.Value<string>("x")), $"unit0.x S{seed}");
                Assert.That(F64Hex(first.y), Is.EqualTo(u0.Value<string>("y")), $"unit0.y S{seed}");
                Assert.That(first.name, Is.EqualTo(u0.Value<string>("name")), $"unit0.name S{seed}");
                Assert.That(first.traitName ?? "", Is.EqualTo(u0.Value<string>("trait") ?? ""), $"unit0.trait S{seed}");
                Assert.That(F64Hex(first.dmg), Is.EqualTo(u0.Value<string>("dmg")), $"unit0.dmg S{seed}");
                Assert.That(F64Hex(first.speed), Is.EqualTo(u0.Value<string>("speed")), $"unit0.speed S{seed}");
                Assert.That(F64Hex(first.maxAgeF), Is.EqualTo(u0.Value<string>("maxAge")), $"unit0.maxAge S{seed}");
                Assert.That(first.flip, Is.EqualTo(u0.Value<int>("flip")), $"unit0.flip S{seed}");
                Assert.That(first.breath, Is.EqualTo(u0.Value<int>("breath")), $"unit0.breath S{seed}");
                Assert.That(F64Hex(first.geneC?.s ?? 1), Is.EqualTo(u0["gene"].Value<string>("s")), $"unit0.gene.s S{seed}");
                Assert.That(F64Hex(first.geneC?.d ?? 1), Is.EqualTo(u0["gene"].Value<string>("d")), $"unit0.gene.d S{seed}");
                Assert.That(F64Hex(first.geneC?.h ?? 1), Is.EqualTo(u0["gene"].Value<string>("h")), $"unit0.gene.h S{seed}");
                Assert.That(F64Hex(first.geneC?.r ?? 1), Is.EqualTo(u0["gene"].Value<string>("r")), $"unit0.gene.r S{seed}");
                Assert.That(Sha256Hex(UnitsCanonical(w.units)), Is.EqualTo(sc.Value<string>("unitsDigest")), $"unitsDigest S{seed}");
                // ⑤ fx（spawn kind：seed int + x/y/ttl/dir f64 位级——fx 2 掷位置对账）
                var goldFx = (Newtonsoft.Json.Linq.JArray)sc["effects"];
                Assert.That(w.effects.Count, Is.EqualTo(goldFx.Count), $"fx count S{seed}");
                for (int k = 0; k < goldFx.Count; k++)
                {
                    var e = (Newtonsoft.Json.Linq.JObject)goldFx[k];
                    var fx = w.effects[k];
                    Assert.That(fx.kind, Is.EqualTo(e.Value<string>("kind")), $"fx kind S{seed}#{k}");
                    Assert.That(fx.seed, Is.EqualTo(e.Value<int>("seed")), $"fx seed S{seed}#{k}");
                    Assert.That(F64Hex(fx.x), Is.EqualTo(e.Value<string>("x")), $"fx x S{seed}#{k}");
                    Assert.That(F64Hex(fx.y), Is.EqualTo(e.Value<string>("y")), $"fx y S{seed}#{k}");
                    Assert.That(F64Hex(fx.ttl), Is.EqualTo(e.Value<string>("ttl")), $"fx ttl S{seed}#{k}");
                    Assert.That(F64Hex(fx.dir), Is.EqualTo(e.Value<string>("dir")), $"fx dir S{seed}#{k}");
                }
                // ⑥ worldEvents（kind/text 序——unshift 语义全量对账）
                var goldEv = (Newtonsoft.Json.Linq.JArray)sc["events"];
                Assert.That(w.worldEvents.Count, Is.EqualTo(goldEv.Count), $"events count S{seed}");
                for (int k = 0; k < goldEv.Count; k++)
                {
                    var e = (Newtonsoft.Json.Linq.JObject)goldEv[k];
                    Assert.That(w.worldEvents[k].kind, Is.EqualTo(e.Value<string>("kind")), $"event kind S{seed}#{k}");
                    Assert.That(w.worldEvents[k].text, Is.EqualTo(e.Value<string>("text")), $"event text S{seed}#{k}");
                }
            }
        }

        /// <summary>结构面：riverDir 值域 ⊆ 0..8 且 riverTiles 与 riverDir>0 一致（河域语义健全性）</summary>
        [Test]
        public void Test29_Rivers_SemanticInvariants()
        {
            var gold = Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText(FindRivers()));
            var scens = (Newtonsoft.Json.Linq.JArray)gold["scenarios"];
            foreach (var scTok in scens)
            {
                var sc = (Newtonsoft.Json.Linq.JObject)scTok;
                int seed = sc.Value<int>("seed");
                var (w, terrain, _) = ReplayChain(seed, sc);
                foreach (int j in w.riverTilesList)
                {
                    Assert.That(w.riverDir[j], Is.InRange(1, 8), $"dir 值域 S{seed}@{j}");
                    Assert.That(terrain[j], Is.EqualTo(WbConstants.T_WATER), $"河 tile 必为水 S{seed}@{j}");
                }
                for (int i = 0; i < w.riverDir.Length; i++)
                    if (w.riverDir[i] == 0) Assert.That(w.riverTiles.Contains(i), Is.False, $"非河 tile 不入集合 S{seed}@{i}");
            }
        }
    }
}
