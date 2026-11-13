// #88 世界大战动态参战 + 联盟阵营体系单测：战火蔓延 / 新生国吞没 / 力竭退出 / 阵营共进退 / 防抖 / 终局 / 存档往返
// 用法：node scripts/ww-dynamic-test.mjs
import { createJiti } from 'jiti';
import path from 'node:path';
const ROOT = '/home/z/my-project/pixel-world-box';
const noop = () => {};
const stubCtx = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return null;
  if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
  if (k === 'measureText') return () => ({ width: 0 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  if (k === 'createPattern') return ({});
  return typeof k === 'string' ? noop : undefined;
}, set: () => true });
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// 落点说明：spawnUnit 的同种族吸收圈 = 首都 42 格——中立国落点必须与所有同种族首都 > 42 格
// （人类 A(40,40) / 精灵 B(100,40) / 矮人 C(40,100) / 兽人 D(100,100) / 哥布林 N(140,140) / 矮人 G(20,140)）

// ============ 0. 场景搭建：四国并立 → 引燃世界大战 ============
console.log('[0] 场景搭建：四国并立 → 引燃终极世界大战');
const eng = new GameEngine(88001113);
const spawns = [[R.HUMAN, 40, 40], [R.ELF, 100, 40], [R.DWARF, 40, 100], [R.ORC, 100, 100]];
const civs = spawns.map(([r, x, y]) => eng.civs[eng.spawnUnit(r, x, y).civ]);
ok(civs.every((c) => c?.alive && c.pop > 0), '四国落地');
for (const c of civs) c.pop = 100; // 抬人口脱离 max(8,·) 支配域，让 28% 阈值真正生效
const [A, B, C, D] = civs;
ok(eng.devUltimateWar(), '引燃世界大战');
ok(eng.worldWar.phase === 'running' && eng.worldWar.belligerents.length === 4, `开战名单 = 全部四国（实测 ${eng.worldWar.belligerents.length}）`);
ok(eng.worldWar.pop0[A.id] === 100 && eng.worldWar.pop0[D.id] === 100, '入伍人口基线已记录');
const startTick = eng.worldWar.startTick;
let G = null; // 跨段共享：[2] 吞没测试的新生国

// ============ 1. 战火蔓延：参战国攻中立国 → 即刻卷入 ============
console.log('[1] 战火蔓延：参战国对中立国开战 → 中立国即刻被卷入');
{
  const uN = eng.spawnUnit(R.GOBLIN, 140, 140);
  const N = eng.civs[uN.civ];
  N.pop = 60;
  ok(!eng.worldWar.belligerents.includes(N.id), '新国不在参战名单（中立）');
  ok(N.foundedTick === eng.tickCount, 'foundedTick 已记录（建国保护期起算）');
  // 保护期内 engulf 扫描不会抓它，但战火蔓延即刻卷入（保护期只挡自动吞没，不挡侵略）
  eng.declareWar(A.id, N.id, 'conquest', { force: true });
  ok(eng.worldWar.belligerents.includes(N.id), '遭参战国进攻 → 即刻卷入（spread）');
  ok((eng.worldWar.joined ?? []).some((j) => j.id === N.id), '卷入记录入 joined 名册');
  ok(eng.worldWar.pop0[N.id] === 60, '后参战国人口基线在入伍时补记');
  ok((eng.worldWar.wwCd ?? {})[N.id] > eng.tickCount, '入伍防抖锁已设（15 年内不可力竭退出）');
}

// ============ 2. 建国保护期 + 战火吞没（engulf） ============
console.log('[2] 建国保护期与战火吞没：4 年豁免 → 期满被卷入');
{
  const uG = eng.spawnUnit(R.DWARF, 20, 140);
  G = eng.civs[uG.civ];
  G.pop = 40;
  const savedRng = eng.rng;
  eng.rng = () => 0; // 概率全开（30% 吞没闸必过）
  eng.worldWarTick();
  ok(!eng.worldWar.belligerents.includes(G.id), '建国保护期内不被战火吞没（age < 160）');
  G.foundedTick -= 200; // 快进年龄越过保护期（模拟岁月流逝）
  eng.worldWarTick();
  ok(eng.worldWar.belligerents.includes(G.id), '保护期满 → 被战火吞没（engulf）');
  eng.rng = savedRng;
}

// ============ 3. 局部战争不升级：两个非参战国互战 ============
console.log('[3] 局部战争保持局部：中立国互战不升级为世界大战参战国');
{
  // 人类距 A(40,40) > 42：Y@HUMAN(10,150)；精灵距 B(100,40) > 42：X@ELF(150,10)
  const uX = eng.spawnUnit(R.ELF, 150, 10);
  const uY = eng.spawnUnit(R.HUMAN, 10, 150);
  const X = eng.civs[uX.civ];
  const Y = eng.civs[uY.civ];
  ok(X.id !== A.id && X.id !== B.id && Y.id !== A.id && Y.id !== B.id, '落点吸收圈外——X/Y 均为新国（ids 实测 ' + X.id + '/' + Y.id + '）');
  X.pop = 30; Y.pop = 30;
  eng.declareWar(X.id, Y.id, 'border', { force: true });
  ok(!eng.worldWar.belligerents.includes(X.id) && !eng.worldWar.belligerents.includes(Y.id), '双方都非参战国 → 保持局部战争（不升级）');
  ok(eng.atWar(X.id, Y.id), '局部战争本身成立');
  eng.makePeace(X.id, Y.id, '测试停战', 20);
  ok(!eng.atWar(X.id, Y.id), '局部战争可正常结束');
}

// ============ 4. 力竭退出：残山剩水的国家乞和离场 ============
console.log('[4] 力竭退出：人口跌破 28% → 乞和离场（非灭亡）');
{
  B.pop = 20; // 20 < max(8, 100×0.28=28)
  const savedRng = eng.rng;
  eng.rng = () => 0; // 30% 概率闸必过
  eng.worldWarTick(); // 重燃循环铺战线 → 力竭判定
  eng.worldWarTick();
  eng.rng = savedRng;
  ok(!eng.worldWar.belligerents.includes(B.id), 'B 已退出参战名单');
  ok((eng.worldWar.capitulated ?? []).some((c) => c.id === B.id), 'B 记入 capitulated 名册（残存为国）');
  ok(B.alive, 'B 仍是在世文明（退出 ≠ 灭亡）');
  ok(!eng.atWar(B.id, A.id) && !eng.atWar(B.id, C.id) && !eng.atWar(B.id, D.id), 'B 与参战国的战线全部罢兵');
  ok((eng.worldWar.wwCd ?? {})[B.id] > eng.tickCount, '退战防抖锁已设（22.5 年内不可再入）');
  ok(![...eng.wwTruce.keys()].some((k) => k.split('-').includes(String(B.id))), 'B 的停战表残留已清（不会过期重燃）');
  const joinedN = eng.worldWar.joined?.length ?? 0;
  const capitN = eng.worldWar.capitulated?.length ?? 0;
  ok(joinedN === 2 && capitN === 1, `动态名册口径：joined=2 / capitulated=1（实测 ${joinedN}/${capitN}）`);
}

// ============ 5. 退战休养期：cd 内不被战火蔓延再度卷入 ============
console.log('[5] 休养生息期：cd 内遭参战国进攻不再回炉');
{
  eng.declareWar(A.id, B.id, 'conquest', { force: true });
  ok(eng.atWar(A.id, B.id), '参战国仍可进攻退战国（局部战争成立）');
  ok(!eng.worldWar.belligerents.includes(B.id), 'cd 锁生效——B 不被再度卷入世界大战');
  eng.makePeace(A.id, B.id, '测试停战', 15);
}

// ============ 6. 阵营共进退：联盟成员参战 → 全盟卷入 ============
console.log('[6] 阵营共进退：一人参战全盟参战（spread 连带 + 入盟连带）');
{
  const alCD = eng.formAlliance(C, D); // 双参战国结盟（阵营对峙）
  ok(!!alCD, 'C·D 缔结联盟（大战中的阵营）');
  // 中立国 X2 加入参战联盟 → 随盟参战（精灵距 B(100,40) > 42：X2@ELF(150,60)）
  const uX2 = eng.spawnUnit(R.ELF, 150, 60);
  const X2 = eng.civs[uX2.civ];
  X2.pop = 50;
  ok(eng.joinAlliance(alCD, X2), '中立国 X2 加入联盟');
  ok(eng.worldWar.belligerents.includes(X2.id), '入盟即随盟参战（bloc）');
  // 中立联盟 Y2·Z2：参战国攻 Y2 → Y2 卷入 → 阵营连带 Z2（人类距 A > 42 / 兽人距 D(100,100) > 42）
  const uY2 = eng.spawnUnit(R.HUMAN, 150, 90);
  const uZ2 = eng.spawnUnit(R.ORC, 60, 140);
  const Y2 = eng.civs[uY2.civ];
  const Z2 = eng.civs[uZ2.civ];
  Y2.pop = 40; Z2.pop = 40;
  const alYZ = eng.formAlliance(Y2, Z2);
  ok(!!alYZ, 'Y2·Z2 缔结中立联盟');
  eng.declareWar(A.id, Y2.id, 'plunder', { force: true }); // 参战国攻 Y2
  ok(eng.worldWar.belligerents.includes(Y2.id) && eng.worldWar.belligerents.includes(Z2.id), 'Y2 被卷入且联盟连带 Z2 一并参战');
}

// ============ 7. 阵营对撞叙事：两个联盟的参战国交战（一次性） ============
console.log('[7] 阵营对撞：两大阵营首次兵戎相见的编年史叙事');
{
  ok(eng.wwClashAnnounced === -1, '对撞尚未播报');
  eng.worldWarTick(); // 重燃循环铺 alCD × alYZ 跨阵营战线 → 对撞检测
  ok(eng.wwClashAnnounced === startTick, `阵营对撞播报已触发（本轮大战唯一一次，实测标记 = ${eng.wwClashAnnounced}）`);
}

// ============ 8. 终局狂热：存活 ≤3 国不退出（不死不休保留） ============
console.log('[8] 终局狂热：≤3 国时力竭退出闸关闭');
{
  eng.worldWar.belligerents = eng.worldWar.belligerents.filter((id) => [A.id, C.id, D.id].includes(id));
  const aliveCount = eng.wwAliveBelligerents().length;
  ok(aliveCount === 3, `残局三强（实测 ${aliveCount}）`);
  A.pop = 5; // 力竭判据满足（5 < max(8, 28)）
  const savedRng = eng.rng;
  eng.rng = () => 0;
  eng.worldWarTick();
  eng.rng = savedRng;
  ok(eng.worldWar.belligerents.includes(A.id), '终局狂热期 A 力竭也不退出（不死不休）');
  ok(eng.worldWar.phase === 'running', '大战仍在进行');
}

// ============ 9. 存档往返：动态参战全量持久化 + 旧档兼容 ============
console.log('[9] 存档往返：joined/capitulated/wwCd 随档走 + 旧档剥离新字段不炸');
{
  const save = eng.serialize('manual');
  const joinedN = eng.worldWar.joined?.length ?? 0;
  const capitN = eng.worldWar.capitulated?.length ?? 0;
  ok(Array.isArray(save.worldWar.joined) && save.worldWar.joined.length === joinedN, `joined 名册入档（${joinedN} 条）`);
  ok(Array.isArray(save.worldWar.capitulated) && save.worldWar.capitulated.length === capitN, `capitulated 名册入档（${capitN} 条）`);
  ok(save.worldWar.wwCd && Object.keys(save.worldWar.wwCd).length > 0, 'wwCd 防抖表入档');
  eng.applySave(save);
  ok(eng.worldWar.phase === 'running' && eng.worldWar.belligerents.length === 3, '读档后大战状态恢复（参战名单原样）');
  ok((eng.worldWar.joined?.length ?? 0) === joinedN && (eng.worldWar.capitulated?.length ?? 0) === capitN, '读档后动态参战名册恢复');
  ok(Object.keys(eng.worldWar.wwCd ?? {}).length > 0, '读档后防抖表恢复');
  ok(eng.wwClashAnnounced === -1, '读档后对撞播报标记复位（新一轮可再播）');
  const legacy = JSON.parse(JSON.stringify(save)); // 模拟 v0.78 旧档：剥离三个新字段
  delete legacy.worldWar.joined;
  delete legacy.worldWar.capitulated;
  delete legacy.worldWar.wwCd;
  eng.applySave(legacy);
  ok(eng.worldWar.phase === 'running' && (eng.worldWar.joined?.length ?? 0) === 0 && (eng.worldWar.capitulated?.length ?? 0) === 0, '旧档（无新字段）读档 → 空缺省不炸');
  eng.applySave(save); // 恢复
}

// ============ 10. 终局路径：神谕终止防抖清零 + 全员力竭文案 ============
console.log('[10] 终局路径：神谕终止防抖清零 + 全员力竭终局文案');
{
  ok(eng.devWwEnd(), '神谕终止大战（ended 路径）');
  ok(eng.worldWar.phase === 'ended', '大战已终战');
  ok(Object.keys(eng.worldWar.wwCd ?? {}).length === 0, '终战后防抖表清零（新一轮大战重新开始）');
  eng.worldWar.phase = 'running'; // 复位直测终局文案分支
  eng.endWorldWar(null); // capitulated 非空（B 在册）→ 力竭分支
  ok(eng.worldWar.endText.includes('列强力竭'), `全员力竭终局文案（实测：「${eng.worldWar.endText.slice(0, 16)}…」）`);
}

// ============ 11. 回归：全新引擎 600 tick 冒烟 + 二次引燃 ============
console.log('[11] 回归冒烟：全新引擎 600 tick 无异常');
{
  const eng2 = new GameEngine(88004242);
  eng2.laws.wars = true;
  // 探针式落点：只保留成功建国（capital ≥ 0）的文明——单单位无首都文明会在 600 tick 内自然消亡（既有行为）
  const probes = [[R.HUMAN, 50, 50], [R.ELF, 100, 40], [R.DWARF, 40, 100], [R.ORC, 100, 100], [R.HUMAN, 110, 110]];
  const healthy = [];
  for (const [r, x, y] of probes) {
    const c = eng2.civs[eng2.spawnUnit(r, x, y).civ];
    if (c?.alive && c.capital >= 0) healthy.push(c);
  }
  ok(healthy.length >= 3, `探针建国 ≥3 国（实测 ${healthy.length}）`);
  let err = null;
  const t0 = Date.now();
  try { for (let t = 0; t < 600; t++) eng2.tick(); } catch (e) { err = e; }
  ok(err === null, `600 tick 冒烟无异常（${Date.now() - t0}ms${err ? ' — ' + err.message : ''}）`);
  ok(eng2.devUltimateWar(), '引燃大战（600 tick 后仍有 ≥2 国在世）');
  ok((eng2.worldWar.joined?.length ?? 0) === 0 && (eng2.worldWar.capitulated?.length ?? 0) === 0, '开战初期动态名册从零开始');
  // 引燃后 600 tick 长跑（动态参战全链在真实节拍下运转）
  let err2 = null;
  try { for (let t = 0; t < 600; t++) eng2.tick(); } catch (e) { err2 = e; }
  ok(err2 === null, `大战中 600 tick 长跑无异常${err2 ? ' — ' + err2.message : ''}`);
  const aliveN = eng2.wwAliveBelligerents().length;
  const joinedN = eng2.worldWar.joined?.length ?? 0;
  ok(eng2.worldWar.phase === 'running' || eng2.worldWar.phase === 'ended', `大战状态机健康（存活参战国 ${aliveN}、后卷入 ${joinedN}）`);
  ok(eng2.worldWar.belligerents.length >= aliveN, '参战名单口径一致（名单 ≥ 存活）');
}

// ============ 12. 广域停战继承：全球停战令期间入伍不开辟新战线 ============
console.log('[12] 广域停战继承：停战期入伍的新参战国继承停战');
{
  // 场景重置：确保上一轮已终止 → 引燃新一轮（动态字段从零）
  if (eng.worldWar.phase === 'running') eng.devWwEnd();
  ok(eng.worldWar.phase === 'ended', '上一轮已终战');
  ok(eng.devUltimateWar(), '引燃新一轮大战');
  ok(eng.devWwTruce(12) > 0, '下达全球停战令（12 年）');
  const truceN = eng.wwTruce.size;
  ok(truceN > 0, `停战条目已铺（${truceN} 对）`);
  // 停战期新中立国被战火吞没（engulf 路径——无侵略战线）
  const uT = eng.spawnUnit(R.GOBLIN, 10, 10); // 哥布林距 N(140,140) 极远
  const T = eng.civs[uT.civ];
  T.pop = 35;
  T.foundedTick -= 200; // 越过建国保护期
  const savedRng = eng.rng;
  eng.rng = () => 0;
  eng.worldWarTick();
  eng.rng = savedRng;
  ok(eng.worldWar.belligerents.includes(T.id), '停战期新国仍被吞没入伍（大战阵营扩张不停摆）');
  const tTruces = [...eng.wwTruce.keys()].filter((k) => k.split('-').includes(String(T.id)));
  const others = eng.wwAliveBelligerents().filter((c) => c.id !== T.id).length;
  ok(tTruces.length === others, `入伍国与全部现存参战国继承停战（${tTruces.length}/${others} 对）`);
  ok(![...eng.warData.keys()].some((k) => k.split('-').includes(String(T.id))), '停战期入伍国无活跃战线（不开辟新战线）');
}

console.log(`\n===== #88 世界大战动态参战单测：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
