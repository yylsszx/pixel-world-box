// ============================================================================
// verify-tool3-only.mjs —— M-U16 段 39 独立验证（tool3 三件套全逻辑；M-U19 扩 14 场景）
//   背景：完整 verify-csharp-port.mjs（39 段）在 sandbox 后台被进程收割
//   （army→render 段两次阵亡实证）；旧 38 段由「本轮零引擎/C# 改动 +
//   Task 172 M-U15 全段 ALL PASS 先例」背书，本脚本独立闭合段 39 逻辑：
//   ① tool3-transcript 镜像 15/15 ② gen-tool3 det 复跑 md5 零漂移
//   ③ 黄金签名完备断言 ④ 双写 md5 一致。M-U19：mutate 双场景签名 +
//   TOOL3_RED=mutate 红证旋钮；M-U20：river-runtime 签名 + TOOL3_RED=river
//   旋钮（禁 setTerrain 级联直写语义 → fireMd5 FAIL → 复绿）。M-U21：grab
//   三场景签名（beginGrab/moveGrab/endGrab 三 API + unitsTick 步进壳 + grabbedTick
//   全链）+ TOOL3_RED=finger 旋钮（禁 grabbedTick 全写面 → 三 grab 场景 FAIL）。
// 运行：node scripts/unity-migration/verify-tool3-only.mjs
// ============================================================================
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let fail = 0;
try {
  execFileSync('bun', [new URL('./tool3-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
  console.log('tool3 黄金回放 (tool3-transcript 镜像 vs tool3.json): PASS (24 场景神力生成器/消费端每步快照逐位 + volcano 锥体/引燃圈/熔岩弹/外溢 + cap 门 13 族 + bless/curse/love/teleport 四瞬态 + M-U19 mutate 特质域 + M-U20 river runtime 级联 + M-U21 grab 三场景（三 API + unitsTick 壳 + grabbedTick 全链） + M-U22 reap 六场景（尸变/王权/凤凰/九头蛇/掉落链/scav/商队） + meteor/meteorShower x0/y0 偏移 + 超武双神力 + typhoon 推拽/间歇雷电/暴雨灭火 + holystorm 审判/缓愈/驱瘟 + units dump 位级含 trait/gene + events colorHex 流 + toasts 面)');
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
  console.log('tool3 gen det 复跑 (gen-tool3 · bun): PASS (24 场景 sanity + GameEngine 真实现 + det 字节级)');
} catch (e) {
  fail++;
  console.error('tool3 gen det 复跑: FAIL —', String(e.message ?? e).slice(0, 200));
}
try {
  const g = JSON.parse(readFileSync(new URL('./golden/tool3.json', import.meta.url), 'utf8'));
  const fails = [];
  const fail2 = (m) => fails.push(m);
  if (!Array.isArray(g.scenarios) || g.scenarios.length !== 24) fail2('场景数 ≠ 24');
  const keys = g.scenarios.map((s) => s.key);
  for (const want of ['volcano-default', 'volcano-power3', 'spawn-quartet', 'meteor-meteorshower', 'wrath-ticks', 'area-powers', 'static-quartet', 'caps-composite', 'typhoon-ticks', 'plasma-annihilate', 'volcano-edge', 'mutate-civ-reroll', 'mutate-wild-clamp', 'holystorm-ticks', 'river-runtime', 'grab-light', 'grab-throw', 'finger-tool'])
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
  const s15 = g.scenarios.find((s) => s.key === 'river-runtime');
  if (!s15 || s15.totalDraws !== 365 || s15.fx.length !== 1 || s15.fx[0]?.seed !== 22436 || s15.stepsSnap.at(-1).rngA !== 'a6fce2f1') fail2('river-runtime 签名缺失（365 掷 = 加权选路 1 掷/步 + 灌溉成林门 1 掷/GRASS 格 + fx spawn 2 + carveRiver L12312-12420 全链）');
  if (s15 && (s15.toasts?.[0]?.text !== '一条大河蜿蜒入海' || s15.events?.[0]?.text !== '一条大河诞生了，蜿蜒流向大海' || JSON.stringify(s15.regrow) !== '[[15892,1500]]')) fail2('river-runtime toast/event/regrow 幸存面缺失（toast id=1 入海文 + event sx+0.5 + regrow 仅 (20,62) 幸存）');
  // —— M-U21 grab 三场景签名（beginGrab/moveGrab/endGrab 三 API + unitsTick 步进壳 + grabbedTick 全链）——
  const s16 = g.scenarios.find((s) => s.key === 'grab-light');
  if (!s16 || s16.totalDraws !== 4 || s16.fx.length !== 2 || s16.stepsSnap.length !== 15 || s16.stepsSnap[0]?.fn !== 'beginGrab') fail2('grab-light 签名缺失（4 掷 = beginGrab fx spawn 2 + endGrab 轻放 fx dust 2；15 步 = 5 calls + 10 unitsTick）');
  if (s16) {
    const lastGrab = s16.stepsSnap.at(-1).units.find((u) => u.id === 900);
    if (!lastGrab || lastGrab.grab !== 0 || lastGrab.thrT !== 0) fail2('grab-light 眩晕衰减链缺失（u900 grab 10→8→6→4→2→0 五更恰清零 + thrT=0）');
    const midGrab = s16.stepsSnap[8].units.find((u) => u.id === 900);
    if (!midGrab || midGrab.grab !== 6) fail2('grab-light 眩晕中点位缺失（步 8 grab=6——第三更）');
    if (s16.stepsSnap.at(-1).grabId !== null || s16.stepsSnap[0].grabId !== 900) fail2('grabId 账面缺失（beginGrab 后 900 / 未命中支后 null）');
    const frozen = s16.stepsSnap.at(-1).units.find((u) => u.id === 901);
    if (!frozen || frozen.grab !== 989) fail2('grab=999 常驻冻结面缺失（u901 999→989 十更递减零 AI）');
  }
  const s17 = g.scenarios.find((s) => s.key === 'grab-throw');
  if (!s17 || s17.totalDraws !== 29 || s17.stepsSnap.length !== 45 || s17.shake < 2 || s17.shake > 3) fail2('grab-throw 签名缺失（29 掷 = fx spawn 2 + 飞行 dust 掷 + 落地 dust×3；45 步 = 3 calls + 42 unitsTick；shake≈2.469）');
  if (s17) {
    const endU = s17.stepsSnap.at(-1).units.find((u) => u.id === 910);
    if (!endU || endU.thrT !== 0 || endU.grab !== 1 || endU.hp !== '0000000000003140' || endU.hurt !== '0000000000002840' || endU.dead !== 0) fail2('grab-throw 落地眩晕面缺失（u910 grab=1/hurt=12.0 递减链/hp=17.0 不致死/thrT=0）');
    // 撞山即坠：步 17/18/19 三步连续位置停滞（山格旁；奇偶停滞仅 2 步——三步连续为撞山特征）
    const sA = s17.stepsSnap[17].units[0], sB = s17.stepsSnap[18].units[0], sC = s17.stepsSnap[19].units[0];
    if (sA.x !== sB.x || sB.x !== sC.x || sA.y !== sB.y || sB.y !== sC.y) fail2('grab-throw 撞山即坠面缺失（步 17-19 三步连续停滞——L5358 tt!==MOUNTAIN 门）');
    const dmgFx = s17.stepsSnap[20].fx.find((f) => f.kind === 'dmg');
    if (!dmgFx) fail2('grab-throw dmgNumbers fx 缺失（fxPrefs.dmgNumbers 默认 true——落地 dmg fx 步 20 age1）');
  }
  const s18 = g.scenarios.find((s) => s.key === 'finger-tool');
  if (!s18 || s18.totalDraws !== 2 || s18.fx.length !== 1 || s18.fx[0]?.kind !== 'spawn') fail2('finger-tool 签名缺失（2 掷 = applyTool case finger → beginGrab fx spawn；分发接线面）');
  if (s18 && s18.stepsSnap[0]?.fn !== 'applyTool') fail2('finger-tool applyTool 分发面缺失（首步 applyTool）');
  // —— M-U22 reap 六场景签名（unitsReap L3321-3472 五主支 + 常规收尸尾链 + 掉落/scav/商队面）——
  const s19 = g.scenarios.find((s) => s.key === 'reap-basic');
  if (!s19 || s19.totalDraws !== 30 || s19.units.length !== 0 || s19.corpses?.length !== 3 || s19.blood?.length !== 3) fail2('reap-basic 签名缺失（30 掷 = 3×skull fx 2 + 3×blood seed 1 + 肉门 2 + dropMeat 掷 + wep 门 1 + dropItem fx 2；三单位全收尸）');
  if (s19 && (!s19.items?.some((i) => i.kind === 'sword1') || !s19.items?.some((i) => i.kind === 'meat') || s19.families?.[0]?.members !== 2 || s19.civs?.[0]?.pop !== 9)) fail2('reap-basic 掉落/家族/civ 面缺失（sword1 缴获 + meat 掉落 + members 3→2 + pop 10→9）');
  const s20 = g.scenarios.find((s) => s.key === 'reap-zombie');
  if (!s20 || s20.totalDraws !== 16 || s20.units?.length !== 1 || s20.units?.[0]?.race !== 5 || s20.units?.[0]?.maxHp !== '0000000000004740' || s20.units?.[0]?.speed !== '9a9999999999a93f') fail2('reap-zombie 签名缺失（16 掷；u940 尸变 race=5/maxHp=46/speed=0.05 位级；u941 MISS 常规收尸对照）');
  if (s20 && (s20.corpses?.length !== 1 || s20.blood?.length !== 1 || s20.items?.length !== 3)) fail2('reap-zombie MISS 支面缺失（u941 常规收尸 corpse+blood+肉×3；zombify continue 无 corpse）');
  const s21 = g.scenarios.find((s) => s.key === 'reap-king');
  if (!s21 || s21.totalDraws !== 3 || s21.events?.[0]?.kind !== 'king' || s21.civs?.[0]?.kingId !== -1 || s21.civs?.[0]?.stability !== '0000000000004a40' || s21.civs?.[0]?.pop !== 9) fail2('reap-king 签名缺失（3 掷 = skull fx 2 + blood seed 1——civ 三连掉落门全 skip；kingId -1 + stability 52 位级 + pop 9）');
  if (s21 && s21.toasts?.[0]?.tone !== 'danger') fail2('reap-king toast danger 面缺失（onKingDeath L1682 宿主回调）');
  const s22 = g.scenarios.find((s) => s.key === 'reap-phoenix');
  if (!s22 || s22.totalDraws !== 14 || s22.ashes?.length !== 1 || s22.ashes?.[0]?.t !== 240 || s22.ashes?.[0]?.rebirths !== 1) fail2('reap-phoenix 签名缺失（14 掷；ash push t=240 非冬/rebirths=1——u960 涅槃 continue 无 skull）');
  if (s22 && s22.events?.filter((e) => e.kind === 'phoenix').length !== 2) fail2('reap-phoenix 双纪事面缺失（涅槃 + 熄灭——u961 rebirths>=3 走常规收尸对照）');
  const s23 = g.scenarios.find((s) => s.key === 'reap-hydra');
  if (!s23 || s23.totalDraws !== 32 || s23.units?.length !== 2 || s23.shake !== 3 || s23.units?.[0]?.gen !== 1 || s23.units?.[0]?.maxHp !== '0000000000c07240') fail2('reap-hydra 签名缺失（32 掷 = 幼蛇×2〔trait 0.15+maxAge+flip+name+breath+家族 0.06 各 1 掷〕+ smoke/blood fx 4 + 肉链；幼蛇 maxHp=300 位级；shake 3）');
  if (s23 && (s23.events?.filter((e) => e.kind === 'hydra').length !== 3 || s23.units?.[0]?.name !== 'Kelvin' || s23.units?.[1]?.name !== 'Nora' || s23.units?.[0]?.parity !== 0 || s23.units?.[1]?.parity !== 1)) fail2('reap-hydra 三纪事/幼蛇名/parity 面缺失（分裂/真终焉/烈焰烧灼 + FIRST[0] 名池位级 Kelvin/Nora + parity 0/1 unitSeq 铅）');
  const s24 = g.scenarios.find((s) => s.key === 'reap-loot');
  if (!s24 || s24.totalDraws !== 40 || s24.items?.length !== 7 || s24.itemSeq !== 8) fail2('reap-loot 签名缺失（40 掷；items 7 = 5 meat + axe1 + chest2 rollItem 掉落）');
  if (s24 && (!s24.items?.some((i) => i.kind === 'lava_boots') || !s24.rel?.[0] || s24.rel[0].v !== '00000000000018c0' || s24.units?.[0]?.food !== 91 || s24.events?.filter((e) => e.kind === 'loot' || e.kind === 'trade').length !== 2)) fail2('reap-loot 掉落/scav/商队面缺失（lava_boots rarity3 池命中 + rel -6 位级 + u984 food 91 + loot/trade 双纪事）');
  const sa = readFileSync(new URL('../../unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool3.json', import.meta.url));
  const gl = readFileSync(new URL('./golden/tool3.json', import.meta.url));
  const md5a = createHash('md5').update(sa).digest('hex');
  const md5b = createHash('md5').update(gl).digest('hex');
  if (md5a !== md5b) fail2(`双写 md5 不一致 ${md5a} ≠ ${md5b}`);
  if (fails.length > 0) throw new Error(fails.join(' | '));
  console.log(`tool3 台账完备 (24 场景 + volcano 锥体/双烈度/边缘钳 + cap 13 族拒面 + 超武双神力 colorHex + 黑洞计数先于 cap + bless/curse/fert 三瞬态 + M-U19 mutate 双场景 + M-U20 river runtime 级联 + M-U21 grab 三场景 + M-U22 reap 六场景 + 双写 md5 ${md5b.slice(0, 8)} 一致): PASS`);
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
// —— M-U20 红证旋钮：TOOL3_RED=river 禁 setTerrain 级联（世界生成直写语义 = C# 切换前缺陷面）→ river-runtime fireMd5 FAIL → 复绿 ——
try {
  const env = { ...process.env, TOOL3_RED: 'river' };
  try {
    execFileSync('bun', [new URL('./tool3-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, env });
    throw new Error('红证未红：TOOL3_RED=river 仍 ALL PASS（旋钮无效）');
  } catch (e) {
    if (String(e.message ?? '').includes('红证未红')) throw e;
    const out = String(e.stdout ?? '');
    if (!out.includes('river-runtime: FAIL')) throw new Error('红证面不达：river-runtime 未 FAIL');
  }
  console.log('tool3 红证旋钮 (TOOL3_RED=river 禁 setTerrain 级联直写语义 → river-runtime fireMd5 FAIL): PASS');
} catch (e) {
  fail++;
  console.error('tool3 river 红证旋钮: FAIL —', String(e.message ?? e).slice(0, 200));
}
// —— M-U21 红证旋钮：TOOL3_RED=finger 禁 grabbedTick 全写面（缺陷面 = C# 硬译漏眩晕递减/飞行/落地链）→ 三 grab 场景 FAIL → 复绿 ——
try {
  const env = { ...process.env, TOOL3_RED: 'finger' };
  try {
    execFileSync('bun', [new URL('./tool3-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, env });
    throw new Error('红证未红：TOOL3_RED=finger 仍 ALL PASS（旋钮无效）');
  } catch (e) {
    if (String(e.message ?? '').includes('红证未红')) throw e;
    const out = String(e.stdout ?? '');
    if (!out.includes('grab-light: FAIL') || !out.includes('grab-throw: FAIL') || !out.includes('finger-tool: FAIL')) throw new Error('红证面不达：三 grab 场景未全 FAIL');
  }
  console.log('tool3 红证旋钮 (TOOL3_RED=finger 禁 grabbedTick 全写面 → 三 grab 场景 FAIL): PASS');
} catch (e) {
  fail++;
  console.error('tool3 finger 红证旋钮: FAIL —', String(e.message ?? e).slice(0, 200));
}
// —— M-U22 红证旋钮：TOOL3_RED=reap 禁全收尸面（缺陷面 = 死单位永不清理/掉落/纪事链缺失）→ 六 reap 场景 FAIL → 复绿 ——
try {
  const env = { ...process.env, TOOL3_RED: 'reap' };
  try {
    execFileSync('bun', [new URL('./tool3-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, env });
    throw new Error('红证未红：TOOL3_RED=reap 仍 ALL PASS（旋钮无效）');
  } catch (e) {
    if (String(e.message ?? '').includes('红证未红')) throw e;
    const out = String(e.stdout ?? '');
    if (!out.includes('reap-basic: FAIL') || !out.includes('reap-zombie: FAIL') || !out.includes('reap-king: FAIL') || !out.includes('reap-phoenix: FAIL') || !out.includes('reap-hydra: FAIL') || !out.includes('reap-loot: FAIL')) throw new Error('红证面不达：六 reap 场景未全 FAIL');
  }
  console.log('tool3 红证旋钮 (TOOL3_RED=reap 禁全收尸面 → 六 reap 场景 FAIL): PASS');
} catch (e) {
  fail++;
  console.error('tool3 reap 红证旋钮: FAIL —', String(e.message ?? e).slice(0, 200));
}
console.log(fail === 0 ? 'VERIFY-TOOL3: ALL PASS' : 'VERIFY-TOOL3: FAIL');
process.exit(fail === 0 ? 0 : 1);
