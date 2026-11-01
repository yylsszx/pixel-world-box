// ============================================================================
// verify-nature-only.mjs —— M-U17 段 40 独立验证（nature 三件套全逻辑）
//   背景同 verify-tool3-only.mjs（全段 40+ 超 sandbox Bash 上限——独立器范式）：
//   ① nature-transcript 镜像 12/12 ② gen-nature det 复跑 md5 零漂移
//   ③ 黄金签名完备断言 ④ 双写 md5 一致。
//   签名面：12 场景掷数（0/0/0/619/622/807/713/27/28/24/12/0——init/tectonic
//   零掷确定域锚 + 释压四支 + geo 四面 + season 四宣告）+ 红证双旋钮
//   （NAT_RED=quake → S4-S7 FAIL / NAT_RED=volc → S10 FAIL——独立器内实跑）。
// 运行：node scripts/unity-migration/verify-nature-only.mjs
// ============================================================================
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let fail = 0;
const U = (p) => new URL(p, import.meta.url).pathname;

// ① 镜像 12/12
try {
  execFileSync('bun', [U('./nature-transcript.mjs')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
  console.log('nature 黄金回放 (nature-transcript 镜像 vs nature.json): PASS (12 场景每步快照逐位——initPlates 独立流基线/recomputePlates Voronoi 抖动/tectonic 漂移+应力法线投影+热点增压/releaseQuake 聚合+log2 震级/natureQuake fx+塌毁门+地裂+伤亡/geologyTick 造山链+岛弧+侵蚀三支+热点喷发 ashF 注入+裂谷/seasonCheck 四宣告——units dump 位级 + events/toasts 流)');
} catch (e) {
  fail++;
  console.error('nature 黄金回放: FAIL');
  console.error(String(e.stdout ?? '').split('\n').slice(-10).join('\n'));
}

// ② gen det 复跑 md5 零漂移
try {
  const { readFile } = await import('node:fs/promises');
  const h0 = createHash('md5').update(await readFile(U('./golden/nature.json'))).digest('hex');
  execFileSync('bun', [U('./gen-nature.mjs')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 400000 });
  const h1 = createHash('md5').update(await readFile(U('./golden/nature.json'))).digest('hex');
  if (h0 !== h1) throw new Error(`golden漂移 ${h0} -> ${h1}`);
  console.log(`nature gen det 复跑 (gen-nature · bun): PASS (12 场景 sanity + GameEngine/NatureSystem 真实现 + det 字节级 md5 ${h0.slice(0, 8)})`);
} catch (e) {
  fail++;
  console.error('nature gen det 复跑: FAIL —', String(e.message ?? e).slice(0, 200));
}

// ③ 黄金签名完备断言
try {
  const g = JSON.parse(readFileSync(U('./golden/nature.json'), 'utf8'));
  const fails = [];
  if (!Array.isArray(g.scenarios) || g.scenarios.length !== 12) fails.push('场景数 ≠ 12');
  const keys = g.scenarios.map((s) => s.key);
  for (const want of ['init-baseline', 'recompute-idem', 'tectonic-drift', 'quake-release', 'quake-tsunami', 'quake-coast', 'quake-aftershock', 'geo-orogeny', 'geo-arc', 'geo-eruption', 'geo-erosion-rift', 'season-cycle'])
    if (!keys.includes(want)) fails.push(`场景 ${want} 缺失`);
  const DRAW_SIG = { 'init-baseline': 0, 'recompute-idem': 0, 'tectonic-drift': 0, 'quake-release': 619, 'quake-tsunami': 622, 'quake-coast': 807, 'quake-aftershock': 713, 'geo-orogeny': 27, 'geo-arc': 28, 'geo-eruption': 24, 'geo-erosion-rift': 12, 'season-cycle': 0 };
  for (const s of g.scenarios) if (s.totalDraws !== DRAW_SIG[s.key]) fails.push(`${s.key} 掷数 ${s.totalDraws} ≠ ${DRAW_SIG[s.key]}`);
  const s1 = g.scenarios.find((s) => s.key === 'init-baseline');
  if (!s1 || s1.nat.plateN < 5 || s1.nat.plateN > 7 || s1.nat.boundaryN < 100 || s1.nat.hotspots.length < 2 || s1.nat.hotspots.length > 4) fails.push('init-baseline 签名缺失（plateN 5-7 + boundary>100 + 热点 2-4）');
  const s2 = g.scenarios.find((s) => s.key === 'recompute-idem');
  if (!s2 || s2.nat.plateMd5 !== s2.stepsSnap[1].nat.plateMd5 || s2.nat.boundaryMd5 !== s2.stepsSnap[1].nat.boundaryMd5) fails.push('recompute-idem 签名缺失（二跑 plateMd5/boundaryMd5 零变——确定性锚）');
  const s3 = g.scenarios.find((s) => s.key === 'tectonic-drift');
  if (!s3 || s3.nat.epoch !== 5 || s3.nat.plateC.length !== 2 * s3.nat.plateN) fails.push('tectonic-drift 签名缺失（5 期 epoch + 质心漂移双列）');
  const s4 = g.scenarios.find((s) => s.key === 'quake-release');
  if (!s4 || s4.nat.counters[0] !== 1 || s4.nat.counters[1] !== 1 || s4.nat.recentQuakes.length !== 1 || s4.fx.length !== 1 || s4.fx[0]?.kind !== 'quake' || s4.fx[0]?.r !== 14 || s4.stepsSnap[0].shake !== 14) fails.push('quake-release 签名缺失（quakes=1+quakesBig=1 + recentQuakes 1 条 m≥7 + fx quake r=14 + shake 14 封顶）');
  if (s4 && s4.units[0].dead !== 1) fails.push('quake-release 伤亡面缺失（u700 震中死亡）');
  const s5 = g.scenarios.find((s) => s.key === 'quake-tsunami');
  if (!s5 || s5.nat.counters[6] !== 1 || !s5.fx.some((e) => e.kind === 'tsunami') || !s5.events.some((e) => e.kind === 'tsunami')) fails.push('quake-tsunami 签名缺失（counters.tsunamis=1 + fx/event tsunami——M-U16 译件消费面点亮）');
  const s6 = g.scenarios.find((s) => s.key === 'quake-coast');
  if (!s6 || !s6.nat.recentQuakes[0] || parseFloat(s6.nat.recentQuakes[0].m) < 7.4) fails.push('quake-coast 签名缺失（m≥7.4 近岸四探面）');
  const s7 = g.scenarios.find((s) => s.key === 'quake-aftershock');
  if (!s7 || s7.nat.recentQuakes.length !== 1 || s7.nat.counters[0] !== 1) fails.push('quake-aftershock 签名缺失（单格 200 应力 → m≈7.44 + 余震掷流锁死）');
  const s8 = g.scenarios.find((s) => s.key === 'geo-orogeny');
  if (!s8 || s8.nat.counters[3] < 1) fails.push('geo-orogeny 签名缺失（uplifts≥1 造山链）');
  const s9 = g.scenarios.find((s) => s.key === 'geo-arc');
  if (!s9 || s9.nat.counters[3] < 5) fails.push('geo-arc 签名缺失（岛弧 uplifts 面）');
  const s10 = g.scenarios.find((s) => s.key === 'geo-eruption');
  if (!s10 || s10.nat.counters[2] !== 1 || !s10.fx.some((e) => e.kind === 'volcano')) fails.push('geo-eruption 签名缺失（eruptions=1 + volcano fx 消费面）');
  const s11 = g.scenarios.find((s) => s.key === 'geo-erosion-rift');
  if (!s11 || s11.nat.counters[4] !== 1) fails.push('geo-erosion-rift 签名缺失（裂谷沉降 erosions=1——boundary 单格化手术中签）');
  const s12 = g.scenarios.find((s) => s.key === 'season-cycle');
  if (!s12 || s12.toasts.length !== 4 || s12.toasts[0].text[0] !== '盛' || s12.toasts[1].text[0] !== '秋' || s12.toasts[2].text[0] !== '寒' || s12.toasts[3].text[0] !== '春') fails.push('season-cycle 签名缺失（四季宣告 toast 文本序 盛夏/秋色/寒冬/春回）');
  if (s12 && s12.nat.lastSeason !== 0) fails.push('season-cycle lastSeason 终态 0 缺失（冬→春闭环）');
  if (fails.length) throw new Error(fails.join('；'));
  console.log('nature 黄金签名完备: PASS (12 场景键在册 + 掷数签名 0/0/0/619/622/807/713/27/28/24/12/0 + plateN/boundary/hotspots 基线 + recompute 二跑零变锚 + epoch=5 漂移 + quake r=14/shake 14 + tsunami 消费 + m≥7.4 近岸 + uplifts/eruptions/erosions 计数 + 四季宣告文本序)');
} catch (e) {
  fail++;
  console.error('nature 黄金签名完备: FAIL —', String(e.message ?? e).slice(0, 400));
}

// ③b 红证双旋钮（独立器内实跑——还原复绿终验）
try {
  let r1 = '', r2 = '';
  try {
    execFileSync('bun', [U('./nature-transcript.mjs')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, env: { ...process.env, NAT_RED: 'quake' } });
    r1 = '未红（旋钮失效）';
  } catch (e) { r1 = /8\/12/.test(String(e.stdout ?? '')) ? '红 8/12（S4-S7 四场景命中）' : String(e.stdout ?? '').split('\n').at(-1); }
  try {
    execFileSync('bun', [U('./nature-transcript.mjs')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, env: { ...process.env, NAT_RED: 'volc' } });
    r2 = '未红（旋钮失效）';
  } catch (e) { r2 = /11\/12/.test(String(e.stdout ?? '')) ? '红 11/12（S10 命中）' : String(e.stdout ?? '').split('\n').at(-1); }
  if (!/S4-S7 四场景命中/.test(r1) || !/S10 命中/.test(r2)) throw new Error(`红证形态异常: quake→${r1} / volc→${r2}`);
  console.log(`nature 红证双旋钮: PASS (NAT_RED=quake ${r1} / NAT_RED=volc ${r2}——纪律②向量有效性证)`);
} catch (e) {
  fail++;
  console.error('nature 红证双旋钮: FAIL —', String(e.message ?? e).slice(0, 200));
}

// ④ 双写 md5 一致
try {
  const { readFile } = await import('node:fs/promises');
  const hA = createHash('md5').update(await readFile(U('./golden/nature.json'))).digest('hex');
  const hB = createHash('md5').update(await readFile(U('../../unity/pixel-world-box/Assets/StreamingAssets/WbGolden/nature.json'))).digest('hex');
  if (hA !== hB) throw new Error(`双写漂移 ${hA} vs ${hB}`);
  console.log(`nature 双写一致: PASS (golden/ + StreamingAssets/WbGolden/ md5 ${hA})`);
} catch (e) {
  fail++;
  console.error('nature 双写一致: FAIL —', String(e.message ?? e).slice(0, 200));
}

console.log(fail === 0 ? 'verify-nature-only: ALL PASS (段 40 四支)' : `verify-nature-only: ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
