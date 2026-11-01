// ============================================================================
// verify-tool3-only.mjs —— M-U16 段 39 独立验证（tool3 三件套全逻辑；M-U19 扩 14 场景）
//   背景：完整 verify-csharp-port.mjs（39 段）在 sandbox 后台被进程收割
//   （army→render 段两次阵亡实证）；旧 38 段由「本轮零引擎/C# 改动 +
//   Task 172 M-U15 全段 ALL PASS 先例」背书，本脚本独立闭合段 39 逻辑：
//   ① tool3-transcript 镜像 14/14 ② gen-tool3 det 复跑 md5 零漂移
//   ③ 黄金签名完备断言 ④ 双写 md5 一致。M-U19：mutate 双场景签名 +
//   TOOL3_RED=mutate 红证旋钮（禁 jumpGene 属性重算写面 → 双场景 FAIL → 复绿）。
// 运行：node scripts/unity-migration/verify-tool3-only.mjs
// ============================================================================
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let fail = 0;
try {
  execFileSync('bun', [new URL('./tool3-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
  console.log('tool3 黄金回放 (tool3-transcript 镜像 vs tool3.json): PASS (14 场景神力生成器/消费端每步快照逐位 + volcano 锥体/引燃圈/熔岩弹/外溢 + cap 门 13 族 + bless/curse/love/teleport 四瞬态 + M-U19 mutate 特质域 reroll/jumpGene/钳位 + meteor/meteorShower x0/y0 偏移 + 超武双神力 + typhoon 推拽/间歇雷电/暴雨灭火 + holystorm 审判/缓愈/驱瘟 + units dump 位级含 trait/gene + events colorHex 流)');
} catch (e) {
  fail++;
  console.error('tool3 黄金回放: FAIL');
  console.error(String(e.stdout ?? '').split('\n').slice(-8).join('\n'));
}
try {
  const goldenPath = new URL('./golden/tool3.json', import.meta.url).pathname;
  const { readFile } = await import('node:fs/promises');
  const h0 = createHash('md5').update(await readFile(goldenPath)).digest('hex');
  execFileSync('bun', [new URL('./gen-tool3.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
  const h1 = createHash('md5').update(await readFile(goldenPath)).digest('hex');
  if (h0 !== h1) throw new Error(`golden漂移 ${h0} -> ${h1}`);
  console.log('tool3 gen det 复跑 (gen-tool3 · bun): PASS (14 场景 sanity + GameEngine 真实现 + det 字节级)');
} catch (e) {
  fail++;
  console.error('tool3 gen det 复跑: FAIL —', String(e.message ?? e).slice(0, 200));
}
try {
  const g = JSON.parse(readFileSync(new URL('./golden/tool3.json', import.meta.url), 'utf8'));
  const fails = [];
  const fail2 = (m) => fails.push(m);
  if (!Array.isArray(g.scenarios) || g.scenarios.length !== 14) fail2('场景数 ≠ 14');
  const keys = g.scenarios.map((s) => s.key);
  for (const want of ['volcano-default', 'volcano-power3', 'spawn-quartet', 'meteor-meteorshower', 'wrath-ticks', 'area-powers', 'static-quartet', 'caps-composite', 'typhoon-ticks', 'plasma-annihilate', 'volcano-edge', 'mutate-civ-reroll', 'mutate-wild-clamp', 'holystorm-ticks'])
    if (!keys.includes(want)) fail2(`场景 ${want} 缺失`);
  const s1 = g.scenarios.find((s) => s.key === 'volcano-default');
  if (!s1 || s1.totalDraws !== 28 || s1.fx.length !== 3 || s1.shake !== 8 || s1.units[0].dead !== 1 || s1.units[0].hurtN !== '0000000000002840' || s1.fx[0]?.seed !== 26084) fail2('volcano-default 签名缺失（28 掷 = 引燃 8 + fx 2 + 熔岩弹 2×4 + 外溢 5×2 + u900 灼烧环死 dead=1 hurtN=12 + shake=8）');
  const s2 = g.scenarios.find((s) => s.key === 'volcano-power3');
  if (!s2 || s2.totalDraws !== 10 || s2.fx.length !== 1 || s2.shake !== 12 || s2.units[0].hp !== '0000000000006940' || s2.fx[0]?.seed !== 53450) fail2('volcano-power3 签名缺失（十字+3x3 熔岩湖 + ring=10.5 + shake 12 封顶 + u910 hp=200 环外幸存）');
  const s3 = g.scenarios.find((s) => s.key === 'spawn-quartet');
  if (!s3 || s3.totalDraws !== 8 || s3.fx.length !== 4 || s3.events.length !== 4 || s3.fx[0]?.r !== 7.5 || s3.fx[0]?.ttl !== '0000000000004540') fail2('spawn-quartet 签名缺失（tsunami r*2.5=7.5 钳 + 四生成器 2 掷/个）');
  const s4 = g.scenarios.find((s) => s.key === 'meteor-meteorshower');
  if (!s4 || s4.totalDraws !== 26 || s4.fx.length !== 7 || s4.stats[1] !== 1 || s4.fx[0]?.x0 !== '0000000000005e40' || s4.fx[0]?.y0 !== '0000000000003a40' || s4.fx[0]?.quiet !== 0) fail2('meteor-meteorshower 签名缺失（单发 x0=120/y0=26 无 quiet + 衍生弹 quiet + statMeteorShowers）');
  if (s4 && !s4.fx.slice(1).every((e) => e.quiet === 1)) fail2('meteor-meteorshower 衍生弹 quiet 面缺失');
  const s5 = g.scenarios.find((s) => s.key === 'wrath-ticks');
  if (!s5 || s5.totalDraws !== 23 || s5.fx.length !== 2 || s5.shake !== 4 || s5.fx[0]?.r !== 4) fail2('wrath-ticks 签名缺失（age%10 雷击×2 + bolt ttl10 到期 splice + wrath r=4 + shake=max 4）');
  const s6 = g.scenarios.find((s) => s.key === 'area-powers');
  if (!s6 || s6.totalDraws !== 44 || s6.fx.length !== 12 || s6.units.length !== 4 || s6.units[0].hp !== '0000000000805140' || s6.units[0].bless !== 600 || s6.units[0].curse !== 500 || s6.units[0].fert !== 500) fail2('area-powers 签名缺失（bless hp=70 + bless/curse/fert 三瞬态 600/500/500 同单位叠印 + teleport 迁移）');
  const s7 = g.scenarios.find((s) => s.key === 'static-quartet');
  if (!s7 || s7.totalDraws !== 8 || s7.fx.length !== 4 || s7.shake !== 7 || s7.stats[4] !== 1 || s7.fx[0]?.r !== 3 || s7.fx[1]?.r !== 10 || s7.fx[2]?.r !== 6 || s7.fx[3]?.r !== 8) fail2('static-quartet 签名缺失（sinkhole r=3/iceage brush 联动 10/famine 6/blackhole 8 + shake 7 + statBlackholes）');
  const s8 = g.scenarios.find((s) => s.key === 'caps-composite');
  if (!s8 || s8.totalDraws !== 90 || s8.fx.length !== 45 || s8.events.length !== 45 || s8.stats[4] !== 3) fail2('caps-composite 签名缺失（13 族 cap 门拒面 45 fx + blackhole 计数先于 cap 门 stats[4]=3）');
  if (s8) {
    const cnt = (k) => s8.fx.filter((e) => e.kind === k).length;
    if (cnt('acid') !== 6 || cnt('rainstorm') !== 6 || cnt('blizzard') !== 4 || cnt('locust') !== 3 || cnt('drought') !== 4 || cnt('wrath') !== 3 || cnt('holystorm') !== 3 || cnt('sandstorm') !== 3 || cnt('typhoon') !== 3 || cnt('sinkhole') !== 3 || cnt('iceage') !== 2 || cnt('famine') !== 3 || cnt('blackhole') !== 2) fail2('caps-composite 13 族逐类计数缺失');
  }
  const s9 = g.scenarios.find((s) => s.key === 'typhoon-ticks');
  if (!s9 || s9.totalDraws !== 122 || s9.fx.length !== 2 || s9.units[0].hurtN !== '0000000000002840' || s9.fx[0]?.r !== 6) fail2('typhoon-ticks 签名缺失（40 tick 游荡推拽 + 环伤 0.18 + age%36 雷击 + 暴雨灭火）');
  const s10 = g.scenarios.find((s) => s.key === 'plasma-annihilate');
  if (!s10 || s10.totalDraws !== 4 || s10.fx.length !== 2 || s10.stats[2] !== 1 || s10.stats[3] !== 1 || s10.fx[0]?.r !== 3.2 || s10.fx[0]?.ttl !== '0000000000804640' || s10.fx[0]?.x0 !== '0000000000405740' || s10.fx[0]?.y0 !== '0000000000804940' || s10.fx[0]?.dmg !== '0000000000805640') fail2('plasma-annihilate 签名缺失（plasma r=3.2 ttl=45 下钳 x0=93 y0=51 dmg=90 + statPlasmas + statAnnihilations）');
  if (s10 && !s10.events.some((e) => e.colorHex === '#ff4d4d')) fail2('annihilationLight colorHex #ff4d4d 面缺失');
  const s11 = g.scenarios.find((s) => s.key === 'volcano-edge');
  if (!s11 || s11.totalDraws !== 9 || s11.fx.length !== 1 || s11.fx[0]?.x0 !== '0000000000000440' || s11.fx[0]?.y0 !== '0000000000000440') fail2('volcano-edge 签名缺失（(1,1) 双钳 cx,cy=2,2 + fx 2.5/2.5 + 负索引卫门）');
  const s12 = g.scenarios.find((s) => s.key === 'holystorm-ticks');
  if (!s12 || s12.totalDraws !== 202 || s12.fx.length !== 7 || s12.units.length !== 3 || s12.units[0].hp !== 'f4ffffffffff5540' || s12.units[0].hurtN !== '0000000000002440') fail2('holystorm-ticks 签名缺失（恶魔审判 hp=88 hurtN=10 + 202 掷恒真门/采样/门掷全链）');
  if (s12 && s12.units[1] && (s12.units[1].infected !== 0 || s12.units[1].hp !== '0c00000000a05740')) fail2('holystorm-ticks 无辜缓愈/驱瘟面缺失（hp=94.5 + infected=0）');
  const s13 = g.scenarios.find((s) => s.key === 'mutate-civ-reroll');
  if (!s13 || s13.totalDraws !== 24 || s13.fx.length !== 2 || s13.fx[0]?.seed !== 37508 || s13.stepsSnap.at(-1).rngA !== '3c13703c') fail2('mutate-civ-reroll 签名缺失（24 掷 = civ 双门 4 + rollTrait 1 + jumpGene 门/值 11 + fx 4×2 + u960 reroll giant→strong）');
  if (s13 && (s13.units[0].trait !== 'strong' || s13.units[0].maxHp !== '0000000000405240' || s13.units[1].gene?.s !== '000000000000f03f' || s13.units[2].gene !== null)) fail2('mutate-civ-reroll 特质/基因/ corpse skip 面缺失（u960 strong hp73 + u961 gene.s 恰 1 + u962 dead gene null）');
  const s14 = g.scenarios.find((s) => s.key === 'mutate-wild-clamp');
  if (!s14 || s14.totalDraws !== 72 || s14.fx.length !== 9 || s14.stepsSnap.at(-1).rngA !== 'b43a4d0f') fail2('mutate-wild-clamp 签名缺失（72 掷 = 3 单位×3 连发 jumpGene 门/值 + fx 18 + baseGene 空表零掷）');
  if (s14 && (s14.units[0].gene?.s !== '0000000000000040' || s14.units[0].maxHp !== '0000000000003240' || s14.units[2].maxHp !== '0000000000003e40')) fail2('mutate-wild-clamp 铛位/重算面缺失（u970 gene.s 恰 2.0 maxHp=18 + u972 wolf maxHp=30）');
  const sa = readFileSync(new URL('../../unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool3.json', import.meta.url));
  const gl = readFileSync(new URL('./golden/tool3.json', import.meta.url));
  const md5a = createHash('md5').update(sa).digest('hex');
  const md5b = createHash('md5').update(gl).digest('hex');
  if (md5a !== md5b) fail2(`双写 md5 不一致 ${md5a} ≠ ${md5b}`);
  if (fails.length > 0) throw new Error(fails.join(' | '));
  console.log(`tool3 台账完备 (14 场景 + volcano 锥体/双烈度/边缘钳 + cap 13 族拒面 + 超武双神力 colorHex + 黑洞计数先于 cap + bless/curse/fert 三瞬态 + M-U19 mutate 双场景 trait/gene/铛位 + 双写 md5 ${md5b.slice(0, 8)} 一致): PASS`);
} catch (e) {
  fail++;
  console.error('tool3 台账完备: FAIL —', String(e.message ?? e).slice(0, 200));
}
// —— M-U19 红证旋钮：TOOL3_RED=mutate 禁 jumpGene 属性重算写面 → 双 mutate 场景 FAIL → 复绿 ——
try {
  const env = { ...process.env, TOOL3_RED: 'mutate' };
  try {
    execFileSync('bun', [new URL('./tool3-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, env });
    throw new Error('红证未红：TOOL3_RED=mutate 仍 ALL PASS（旋钮无效）');
  } catch (e) {
    if (String(e.message ?? '').includes('红证未红')) throw e;
    const out = String(e.stdout ?? '');
    if (!out.includes('mutate-civ-reroll: FAIL') || !out.includes('mutate-wild-clamp: FAIL')) throw new Error('红证面不达：双 mutate 场景未 FAIL');
  }
  console.log('tool3 红证旋钮 (TOOL3_RED=mutate 禁 jumpGene 重算写面 → 双 mutate 场景 FAIL): PASS');
} catch (e) {
  fail++;
  console.error('tool3 红证旋钮: FAIL —', String(e.message ?? e).slice(0, 200));
}
console.log(fail === 0 ? 'VERIFY-TOOL3: ALL PASS' : 'VERIFY-TOOL3: FAIL');
process.exit(fail === 0 ? 0 : 1);
