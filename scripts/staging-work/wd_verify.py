#!/usr/bin/env python3
# M-U7g: verify-csharp-port.mjs 追加段 28（waterdepth 镜像回放 + gen det 复跑 + 双写 md5）
import io
p = '/tmp/gh-repo-staging/scripts/unity-migration/verify-csharp-port.mjs'
src = io.open(p, encoding='utf-8').read()

# ① 段 28 插入在 allPass 行之前
anchor = 'const allPass = '
assert src.count(anchor) == 1, 'allPass anchor: %d' % src.count(anchor)
seg28 = """// 段 28：M-U7g 水深分级双链（waterdepth-transcript 镜像 4 场景逐位 + gen det 复跑 + 双写 md5 + 分布台账）
{
  const { execFileSync } = await import('node:child_process');
  const { createHash, } = await import('node:crypto');
  var waterdepthVerifyFail = 0;
  try {
    execFileSync('node', [new URL('./waterdepth-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 200000 });
    console.log('waterdepth 黄金回放 (waterdepth-transcript 镜像 vs waterdepth.json): PASS (4 场景 40960 格逐位 ×4)');
  } catch (e) {
    waterdepthVerifyFail++;
    console.error('waterdepth 黄金回放: FAIL');
    console.error(String(e.stdout ?? '').split('\\n').slice(-8).join('\\n'));
  }
  try {
    const goldenPath = new URL('./golden/waterdepth.json', import.meta.url).pathname;
    const h0 = createHash('md5').update(await (await import('node:fs')).promises.readFile(goldenPath)).digest('hex');
    execFileSync('node', [new URL('./gen-waterdepth.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 280000 });
    const h1 = createHash('md5').update(await (await import('node:fs')).promises.readFile(goldenPath)).digest('hex');
    if (h0 !== h1) throw new Error(`golden漂移 ${h0} -> ${h1}`);
    console.log('waterdepth gen det 复跑 (gen-waterdepth): PASS (4 场景 sanity 16 + 引擎字段自洽 + det 字节级)');
  } catch (e) {
    waterdepthVerifyFail++;
    console.error('waterdepth gen det 复跑: FAIL —', String(e.message ?? e).slice(0, 200));
  }
  try {
    const { readFileSync } = await import('node:fs');
    const g = JSON.parse(readFileSync(new URL('./golden/waterdepth.json', import.meta.url), 'utf8'));
    if (!Array.isArray(g.scens) || g.scens.length !== 4) throw new Error('场景数 ≠ 4');
    // 分布台账：tier ⊆ 0..4 且 0/2/3/4 全场景必现（与 gen/NUnit 同款 sanity）
    for (const s of g.scens) {
      if (s.hist.length !== 5) throw new Error(s.name + ' hist 维度');
      for (const t of [0, 2, 3, 4]) if (!s.hist[t]) throw new Error(s.name + ' tier ' + t + ' 零覆盖');
    }
    // 双写 md5（golden/ ↔ StreamingAssets/WbGolden/）
    const sa = readFileSync(new URL('../../unity/pixel-world-box/Assets/StreamingAssets/WbGolden/waterdepth.json', import.meta.url));
    const gl = readFileSync(new URL('./golden/waterdepth.json', import.meta.url));
    const md5a = createHash('md5').update(sa).digest('hex');
    const md5b = createHash('md5').update(gl).digest('hex');
    if (md5a !== md5b) throw new Error(`双写 md5 不一致 ${md5a} ≠ ${md5b}`);
    console.log(`waterdepth 台账完备 (4 场景 + 分布 sanity + 双写 md5 ${md5b.slice(0, 8)} 一致): PASS`);
  } catch (e) {
    waterdepthVerifyFail++;
    console.error('waterdepth 台账完备: FAIL —', String(e.message ?? e).slice(0, 200));
  }
}

"""
src = src.replace(anchor, seg28 + anchor, 1)

# ② allPass 链接入
old_chain = '&& orchVerifyFail === 0 && worldgenVerifyFail === 0;'
new_chain = '&& orchVerifyFail === 0 && worldgenVerifyFail === 0 && waterdepthVerifyFail === 0;'
assert src.count(old_chain) == 1, 'chain: %d' % src.count(old_chain)
src = src.replace(old_chain, new_chain)
io.open(p, 'w', encoding='utf-8').write(src)
print('OK verify seg28 wired')
