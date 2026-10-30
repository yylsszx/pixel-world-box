#!/usr/bin/env python3
# M-U7g: WbGoldenTests.cs 追加 Test27 水深分级黄金（pre-river 域 4 场景逐位）
import io
p = '/tmp/gh-repo-staging/unity/pixel-world-box/Assets/Tests/WbGoldenTests.cs'
src = io.open(p, encoding='utf-8').read()
anchor = """                scenN++;
            }
            Assert.AreEqual(7, scenN, "回放场景数");
        }
    }
}"""
assert src.count(anchor) == 1, 'anchor not unique: %d' % src.count(anchor)
block = """                scenN++;
            }
            Assert.AreEqual(7, scenN, "回放场景数");
        }

        // ============================================================
        // Test27 — M-U7g 水深分级黄金（waterdepth.json 4 场景，pre-river 域）
        // GenerateWorld terrain 逐字节（与 Test26 worldgen 链交叉锁定）→
        // WbWorldgen.RebuildWaterTiers（engine.ts L1048-1050）逐位 vs waterTierAt 真方法黄金
        // ============================================================
        [Test]
        public void Test27_Waterdepth_Golden()
        {
            var gold = Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText(FindGolden2Wg("waterdepth.json")));
            var scens = (Newtonsoft.Json.Linq.JArray)gold["scens"];
            Assert.AreEqual(4, scens.Count, "场景数 4");
            int scenN = 0;
            foreach (var sc in scens)
            {
                string name = sc["name"].ToString();
                int seed = sc["seed"].Value<int>();
                var parms = WgParams(sc["params"]);
                // ① pre-river terrain：WbWorldgen.GenerateWorld（M-U7f' 黄金链同源域）逐字节
                WbWorldGenResult res = WbWorldgen.GenerateWorld(seed, parms);
                byte[] gt = GunzipB64(sc["terrainGzB64"].ToString());
                Assert.IsTrue(gt.AsSpan().SequenceEqual(res.Terrain), $"{name} terrain 逐字节（pre-river 域）");
                // ② 水深全场：RebuildWaterTiers → waterTierGzB64 逐位（蓝本 waterTierAt 真方法黄金）
                byte[] gwd = GunzipB64(sc["waterTierGzB64"].ToString());
                byte[] tiers = new byte[res.Terrain.Length];
                WbWorldgen.RebuildWaterTiers(res.Terrain, tiers);
                Assert.IsTrue(gwd.AsSpan().SequenceEqual(tiers), $"{name} waterTier 逐位");
                // ③ 值域 + 分布：tier ⊆ 0..4；0/2/3/4 全场景必现（gen 侧同款 sanity）
                var hist = new int[5];
                foreach (byte v in tiers)
                {
                    Assert.Less(v, 5, $"{name} tier 值域");
                    hist[v]++;
                }
                Assert.Greater(hist[0], 0, $"{name} tier0 覆盖");
                Assert.Greater(hist[2], 0, $"{name} tier2 覆盖");
                Assert.Greater(hist[3], 0, $"{name} tier3 覆盖");
                Assert.Greater(hist[4], 0, $"{name} tier4 覆盖");
                scenN++;
            }
            Assert.AreEqual(4, scenN, "回放场景数");
        }
    }
}"""
io.open(p, 'w', encoding='utf-8').write(src.replace(anchor, block))
print('OK Test27 appended, lines now:', len(io.open(p, encoding='utf-8').readlines()))
