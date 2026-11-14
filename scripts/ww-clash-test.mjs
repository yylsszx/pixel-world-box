// #91 阵营对撞的战争加成（warSurge）单测：进入 / 持续 / 失效三态 + 互斥边界（非对撞大战无加成）
// 用法：node scripts/ww-clash-test.mjs
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

// ============ 0. 场景搭建：五国两阵营 + 无阵营散兵 → 引燃世界大战 ============
console.log('[0] 场景搭建：A1·A2 与 B1·B2 两联盟 + 无阵营 E，引燃终极世界大战');
const eng = new GameEngine(88002211);
// 落点彼此 > 42 格（同种族吸收圈），异种族无此约束但保持间距防国土粘连
const spawns = [
  [R.HUMAN, 40, 40], [R.ELF, 100, 40],     // 阵营甲：A1 A2
  [R.DWARF, 40, 100], [R.ORC, 100, 100],   // 阵营乙：B1 B2
  [R.GOBLIN, 140, 140],                    // 无阵营散兵：E
];
const civs = spawns.map(([r, x, y]) => eng.civs[eng.spawnUnit(r, x, y).civ]);
ok(civs.every((c) => c?.alive && c.pop > 0), '五国落地');
for (const c of civs) c.pop = 100;
const [A1, A2, B1, B2, E] = civs;
ok(eng.devUltimateWar(), '引燃世界大战');
const startTick = eng.worldWar.startTick;
ok(eng.worldWar.phase === 'running' && eng.worldWar.belligerents.length === 5, `开战名单 = 全部五国（实测 ${eng.worldWar.belligerents.length}）`);

// ============ 1. 互斥边界：未对撞的世界大战无加成（播报前置闸） ============
console.log('[1] 互斥边界：对撞未播报 → 加成不生效');
{
  ok(eng.wwClashAnnounced === -1, '对撞尚未播报');
  ok(eng.wwClashSides() === null, 'wwClashSides 为 null（未播报）');
  ok(eng.wwClashBoost(A1.id) === false, '无阵营国无加成（E 未结盟）');
  const alA = eng.formAlliance(A1, A2);
  const alB = eng.formAlliance(B1, B2);
  ok(!!alA && !!alB, '两联盟缔结（A1·A2 / B1·B2）');
  ok(eng.wwClashSides() === null, '结盟但尚未交战播报 → 仍无加成');
}

// ============ 2. 加成进入：跨阵营战线铺开 → 播报 + 双方全员加成 ============
console.log('[2] 加成进入：阵营对撞播报 → 双方参战国全员加成');
{
  const savedRng = eng.rng;
  eng.rng = () => 0; // 防吞没/退场闸干扰
  eng.worldWarTick(); // 重燃循环铺跨阵营战线 + 对撞检测
  eng.rng = savedRng;
  ok(eng.wwClashAnnounced === startTick, `对撞播报已触发（实测标记 = ${eng.wwClashAnnounced}）`);
  const sides = eng.wwClashSides();
  ok(sides !== null && sides.length === 2, 'wwClashSides 返回两侧');
  ok(eng.wwClashBoost(A1.id) && eng.wwClashBoost(A2.id), '阵营甲全员加成');
  ok(eng.wwClashBoost(B1.id) && eng.wwClashBoost(B2.id), '阵营乙全员加成');
  ok(eng.wwClashBoost(E.id) === false, '无阵营参战国 E 无加成（互斥边界）');
}

// ============ 3. 加成持续：战火暂熄（停战）仍维持，直到一方全员退出 ============
console.log('[3] 加成持续：跨阵营战火暂熄 → 回退判定仍维持双方加成');
{
  // 模拟停战：清空甲乙交战状态并设停战锁（不退场）
  for (const a of [A1, A2]) for (const b of [B1, B2]) eng.wwTruce.set(`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`, eng.tickCount + 9999);
  const sides = eng.wwClashSides();
  ok(sides !== null, '战火暂熄但两阵营均在场 → sides 回退成立');
  ok(eng.wwClashBoost(A1.id) && eng.wwClashBoost(B1.id), '双方加成持续（角力未散）');
  // 中立国（未参战）即使加入阵营也不享受（非参战国闸）
  const uN = eng.spawnUnit(R.ELF, 150, 60);
  const N = eng.civs[uN.civ];
  ok(eng.wwClashBoost(N.id) === false, '未参战国即使有阵营也无加成');
  eng.wwTruce.clear();
}

// ============ 4. 加成失效①：任一阵营全员退出大战 ============
console.log('[4] 失效①：阵营乙全员力竭退出 → 加成全面失效');
{
  // 甲乙恢复交战（清停战后重燃循环会自动宣战，这里直接手动开战更确定）
  eng.declareWar(A1.id, B1.id, 'annex', { force: true, total: true, quiet: true });
  ok(eng.wwClashBoost(A1.id), '交战恢复 → 加成在场');
  // 乙阵营全员退场：从参战名单移除 B1·B2（模拟 wwCapitulate 的名单效应）
  eng.worldWar.belligerents = eng.worldWar.belligerents.filter((id) => id !== B1.id && id !== B2.id);
  ok(eng.wwClashSides() === null, '乙阵营全员退出 → sides = null');
  ok(eng.wwClashBoost(A1.id) === false && eng.wwClashBoost(B1.id) === false, '双方加成均失效（对撞不复存在）');
}

// ============ 5. 加成失效②：阵营解体 ============
console.log('[5] 失效②：阵营甲解体 → 加成失效');
{
  // 恢复乙阵营参战身份，重建对撞
  eng.worldWar.belligerents.push(B1.id, B2.id);
  eng.declareWar(A1.id, B1.id, 'annex', { force: true, total: true, quiet: true });
  ok(eng.wwClashSides() !== null && eng.wwClashBoost(A2.id), '对撞重建 → 甲阵营加成恢复');
  const alA = eng.allianceOfCiv(A1.id);
  eng.dissolveAlliance(alA, '测试解体');
  ok(eng.allianceOfCiv(A1.id) === null, '甲阵营已解体');
  // 甲侧无联盟成员 → 只剩乙一个阵营 → 对撞不存在
  ok(eng.wwClashBoost(A1.id) === false, '解体国无加成');
  ok(eng.wwClashBoost(B1.id) === false, '对侧也失去对撞加成（单阵营不成对撞）');
}

// ============ 6. 加成失效③：大战结束 ============
console.log('[6] 失效③：大战终局 → 加成随大战落幕');
{
  // 重建甲联盟恢复对撞，再终战
  const alA2 = eng.formAlliance(A1, A2);
  ok(!!alA2 && eng.wwClashBoost(A1.id), '对撞再恢复 → 加成在场');
  eng.endWorldWar(A1, false);
  ok(eng.worldWar.phase === 'ended', '大战已结束');
  ok(eng.wwClashSides() === null && eng.wwClashBoost(A1.id) === false && eng.wwClashBoost(B1.id) === false, '大战结束 → 加成全面失效');
}

// ============ 7. 存档兼容：零新增序列化字段（纯派生态） ============
console.log('[7] 存档兼容：warSurge 无新增字段，旧档新档行为一致');
{
  const save = eng.serialize('manual');
  const wwKeys = Object.keys(save.worldWar ?? {});
  ok(!wwKeys.includes('clashBoost') && !wwKeys.includes('surge'), 'worldWar 无加成相关新字段');
  ok(!('clashSides' in save), '顶层无 clashSides 字段');
  const eng2 = new GameEngine(1);
  ok(typeof eng2.wwClashBoost === 'function' && eng2.wwClashBoost(0) === false, '新引擎冷启动即 false（大战未开）');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
