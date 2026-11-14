// #96 阵营间集体投降（wwCapitulate 集体分支）单测：盟主退战全盟跟随 / 成员单独退战不连带 / 斡旋对跟随者各自生效 / 凝聚力分档 / 无盟主边界
// 用法：node scripts/ww-collective-test.mjs
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

// ============ 0. 场景搭建：甲盟（L 领袖 + F1 F2）+ 乙盟（E2 领袖 + E1），引燃大战 ============
console.log('[0] 场景搭建：甲盟三邦（L 领袖）对乙盟两邦（E2 领袖），引燃世界大战');
const eng = new GameEngine(88002244);
const spawns = [
  [R.HUMAN, 40, 40], [R.ELF, 90, 40], [R.DWARF, 140, 40],   // 甲盟：L F1 F2
  [R.ORC, 40, 100], [R.GOBLIN, 90, 100],                     // 乙盟：E2(领袖) E1
];
const civs = spawns.map(([r, x, y]) => eng.civs[eng.spawnUnit(r, x, y).civ]);
for (const c of civs) c.pop = 100;
ok(civs.every((c) => c?.alive && c.pop > 0), '五国落地');
ok(eng.devUltimateWar(), '引燃世界大战');
const [L, F1, F2, E1, E2] = civs;
const alA = eng.formAlliance(L, F1);
ok(!!alA && alA.leader === L.id, '甲盟缔结（L 为盟主）');
alA.members.push(F2.id); // 测试场景：F2 直接扩编（formAlliance 只收两邦）
const alB = eng.formAlliance(E2, E1);
ok(!!alB && alB.leader === E2.id, '乙盟缔结（E2 为盟主，E1 是成员）');
alA.cohesion = 100; alB.cohesion = 100; // 满凝聚力基线，档位可测
ok(eng.worldWar.belligerents.length === 5, `参战名单 = 五国（实测 ${eng.worldWar.belligerents.length}）`);
// 中立富国 M（开战后落地，大战不承认中立所以必须后落）——先贫化，第 3 节再恢复富态
const uM = eng.spawnUnit(R.HUMAN, 150, 150);
const M = eng.civs[uM.civ];
M.pop = 30; // < 60：不适格斡旋者（第 1、2 节保持无斡旋环境，避免污染 wwMediated 账本）

// ============ 1. 盟主力竭退出 → 全盟跟随（无斡旋环境，直接退） ============
console.log('[1] 集体投降：L 力竭 → 全盟退出（M 贫化无斡旋）');
{
  eng.worldWar.pop0[L.id] = 100;
  L.pop = 20; // 力竭
  eng.rng = () => 0.9; // 神谕闸不过（0.9 ≥ 0.2）——本节全程无斡旋
  ok(eng.wwCapitulate(L) === true, 'L 力竭退出成功');
  ok(!eng.worldWar.belligerents.includes(L.id), '盟主 L 已除名');
  ok(!eng.worldWar.belligerents.includes(F1.id) && !eng.worldWar.belligerents.includes(F2.id), '全盟跟随：F1·F2 相继退出');
  ok((eng.worldWar.capitulated ?? []).filter((c) => [L.id, F1.id, F2.id].includes(c.id)).length === 3, 'capitulated 账本记三笔');
  const wwCd = eng.worldWar.wwCd ?? {};
  ok((wwCd[L.id] ?? 0) > eng.tickCount && (wwCd[F1.id] ?? 0) > eng.tickCount && (wwCd[F2.id] ?? 0) > eng.tickCount, '全盟进入休养生息期');
  ok(alA.cohesion === 92, `凝聚力集体档位 -8（100 → ${alA.cohesion}）`);
  ok(alA.members.length === 3 && alA.leader === L.id, '联盟不解体（残部仍为阵营）');
  ok(eng.wwMediated.size === 0, '全程无斡旋（wwMediated 空）');
  F1.pop = 15; F2.pop = 15; // 残兵贫化：退战后仍可能被别国请去斡旋（pop ≥ 60 且 ≥ 3×力竭国才适格），第 2 节要保持无斡旋环境
  eng.rng = Math.random;
}

// ============ 2. 成员单独退战不连带（乙盟成员 E1，领袖是 E2） ============
console.log('[2] 个体退出：E1（非盟主）力竭 → 只退自己，E2 不跟随');
{
  eng.worldWar.pop0[E1.id] = 100;
  E1.pop = 20;
  eng.rng = () => 0.9; // 无斡旋（M 仍贫化）
  const cohesionBefore = alB.cohesion;
  ok(eng.wwCapitulate(E1) === true, 'E1 力竭退出成功');
  ok(!eng.worldWar.belligerents.includes(E1.id), 'E1 已除名');
  ok(eng.worldWar.belligerents.includes(E2.id), 'E2 不跟随（成员退出无连带）');
  ok(alB.cohesion === cohesionBefore - 12, `个体档位 -12（${cohesionBefore} → ${alB.cohesion}）`);
  ok(eng.wwMediated.size === 0, '仍无斡旋（残兵 F1·F2 已贫化不适格，神谕闸也不过）');
  eng.rng = Math.random;
}

// ============ 3. 斡旋对盟主与跟随者各自生效 ============
console.log('[3] 留守分支：F1 继位盟主力竭 → 首次斡旋成功留守；二次退出时 F2 斡旋成功留守');
{
  // 甲盟残部 F1 F2 重新卷入（直接推回名单 + 补 pop0；wwCd 不拦手动归队）
  eng.worldWar.belligerents.push(F1.id, F2.id);
  eng.worldWar.pop0[F1.id] = 100;
  eng.worldWar.pop0[F2.id] = 100;
  F1.pop = 80; F2.pop = 80;
  ok(eng.worldWar.belligerents.includes(F1.id) && eng.worldWar.belligerents.includes(F2.id), 'F1·F2 已回到参战名单');
  // 盟主继位（原盟不解体，领袖换人——游戏内实际由 allianceTick 选贤，这里直接赋值）
  alA.leader = F1.id;
  alA.cohesion = 100;
  ok(eng.allianceOfCiv(F1.id)?.leader === F1.id, 'F1 继位盟主');
  M.pop = 600; // 恢复富态：600 ≥ 3×80=240，对 F1·F2 都是适格斡旋者
  eng.worldWar.pop0[F1.id] = 100;
  F1.pop = 20; // F1 力竭
  eng.rng = () => 0; // 所有概率闸全开 → F1 斡旋必成功
  const nBefore = eng.worldWar.belligerents.length;
  ok(eng.wwCapitulate(F1) === true, 'wwCapitulate 返回 true');
  ok(eng.worldWar.belligerents.includes(F1.id) && eng.worldWar.belligerents.length === nBefore, '盟主斡旋成功 → 留守，不触发集体投降');
  ok(eng.wwMediated.has(F1.id), 'F1 斡旋已记账');
  ok(!eng.worldWar.belligerents.includes(F2.id) === false, 'F2 不受牵连（盟主留守则无集体）');
  // F1 再力竭：wwMediated 已记账 → 斡旋闸关闭 → 真退出 → 集体投降 → F2 的独立斡旋也必成功（rng=0）→ 留守
  F1.pop = 15;
  ok(eng.wwCapitulate(F1) === true, 'F1 二次力竭退出（防抖拦斡旋）');
  ok(!eng.worldWar.belligerents.includes(F1.id), 'F1 已除名');
  ok(eng.worldWar.belligerents.includes(F2.id), '跟随者 F2 斡旋成功 → 留守战线');
  ok(eng.wwMediated.has(F2.id), 'F2 独立斡旋记账（每国自己的防抖）');
  ok(eng.wwTruce.has(`${Math.min(F2.id, E2.id)}-${Math.max(F2.id, E2.id)}`) || !eng.atWar(F2.id, E2.id), '留守的 F2 与敌方停战（白色和平/本就无战线）');
  eng.rng = Math.random;
}

// ============ 4. 无跟随者边界：E2（乙盟领袖）力竭，但唯一成员 E1 已退 → 空集体 ============
console.log('[4] 空集体边界：E2 力竭 → 集体分支空跑，正常退出不炸');
{
  M.pop = 30; // 再贫化：无斡旋
  eng.worldWar.pop0[E2.id] = 100;
  E2.pop = 20;
  eng.rng = () => 0.9; // 神谕闸不过
  const cohesionBefore = alB.cohesion;
  ok(eng.wwCapitulate(E2) === true, 'E2 力竭退出');
  ok(!eng.worldWar.belligerents.includes(E2.id), 'E2 已除名');
  ok(alB.cohesion === cohesionBefore - 8, `空集体仍走集体档位 -8（${cohesionBefore} → ${alB.cohesion}）`);
  eng.rng = Math.random;
}

// ============ 5. 终局联动：参战名单清空 → 下个 tick 大战收束（列强力竭分支） ============
console.log('[5] 终局联动：名单耗尽 → endWorldWar 兜底');
{
  eng.worldWar.belligerents = eng.worldWar.belligerents.filter((b) => b !== F2.id);
  const before = eng.worldWar.phase;
  eng.worldWarTick();
  ok(before === 'running' && eng.worldWar.phase === 'ended', `大战随名单耗尽收束（${before} → ${eng.worldWar.phase}）`);
  ok(eng.worldWar.endText.includes('力竭') || eng.worldWar.endText.includes('退出'), `力竭终局文案（${eng.worldWar.endText}）`);
}

// ============ 6. 存档兼容：零新增序列化字段 ============
console.log('[6] 存档兼容：集体投降无新增字段');
{
  const save = eng.serialize('manual');
  const wwKeys = Object.keys(save.worldWar ?? {});
  ok(!wwKeys.includes('collective') && !wwKeys.includes('followers'), 'worldWar 无集体投降相关新字段');
  ok(!('wwExitTiers' in save), '顶层无退出档位字段');
  const eng2 = new GameEngine(1);
  ok(typeof eng2.wwExitCore === 'function', 'wwExitCore 方法在位（新引擎）');
  ok(eng2.wwCapitulate(eng2.civs[0] ?? {}) === false, '无大战时 wwCapitulate 恒 false');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
