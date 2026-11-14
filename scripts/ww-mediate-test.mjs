// #95 力竭退出的斡旋事件（wwMediate）单测：斡旋成功/失败/无斡旋者/防抖/边界（不适格斡旋者/非力竭/终局狂热）+ 存档兼容
// 用法：node scripts/ww-mediate-test.mjs
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
const pk = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;

// ============ 0. 场景搭建：三国参战 + 中立富国 M（pop 600 ≥ 3× 力竭国） ============
console.log('[0] 场景搭建：A·B·C 参战 + 中立富国 M，引燃终极世界大战');
const eng = new GameEngine(88002233);
const spawns = [
  [R.HUMAN, 40, 40], [R.ELF, 100, 40],   // A B（交战双方）
  [R.DWARF, 40, 100],                     // C（参战第三方）
];
const [A, B, C] = spawns.map(([r, x, y]) => eng.civs[eng.spawnUnit(r, x, y).civ]);
for (const c of [A, B, C]) c.pop = 100;
ok(A?.alive && B?.alive && C?.alive, '三国落地');
ok(eng.devUltimateWar(), '引燃世界大战');
ok(eng.worldWar.phase === 'running' && eng.worldWar.belligerents.length === 3, `开战名单 = A·B·C 三国（实测 ${eng.worldWar.belligerents.length}）`);
// 中立富国 M 在开战后落地（大战不承认中立——若先落地会被一并卷入；此处验证斡旋者资格而非吞没闸）
const uM = eng.spawnUnit(R.ORC, 140, 140);
const M = eng.civs[uM.civ];
M.pop = 600; // 中立富国：非参战 + pop ≥ 60 + ≥ 3× 力竭国
ok(M?.alive && !eng.worldWar.belligerents.includes(M.id), 'M 开战后落地，保持中立');

// ============ 1. 非力竭不触发：wwCapitulate 判据未达 → 无斡旋无退出 ============
console.log('[1] 非力竭边界：人口未崩 → 不退出也不斡旋');
{
  eng.rng = () => 0; // 若走到概率闸必成功——用于证明根本没走斡旋
  ok(eng.wwCapitulate(A) === false, '人口健康 → wwCapitulate 直接 false');
  ok(eng.wwMediated.size === 0, '未发生任何斡旋');
  eng.rng = Math.random;
}

// ============ 2. 斡旋成功：白色停战，寸土不失，留在战争中 ============
console.log('[2] 斡旋成功：A 力竭 → M 斡旋 → 全线白色停战');
{
  eng.declareWar(A.id, B.id, 'annex', { force: true, total: true, quiet: true });
  eng.declareWar(A.id, C.id, 'annex', { force: true, total: true, quiet: true });
  eng.worldWar.pop0[A.id] = 100;
  A.pop = 20; // 跌破 28% 基线 → 力竭
  const tilesA = A.tiles.length;
  eng.rng = () => 0; // 斡旋必发生（M 适格）且必成功（0 < 0.5）
  ok(eng.wwCapitulate(A) === true, 'wwCapitulate 返回 true（斡旋接管，非退出）');
  ok(eng.worldWar.belligerents.includes(A.id), 'A 仍在参战名单（斡旋成功不退出）');
  ok(eng.wwMediated.has(A.id), '斡旋防抖已记账');
  ok(!eng.atWar(A.id, B.id) && !eng.atWar(A.id, C.id), 'A 与 B·C 均已停战');
  ok(eng.wwTruce.has(pk(A.id, B.id)) && eng.wwTruce.has(pk(A.id, C.id)), '停战表覆盖全部参战对');
  ok(A.tiles.length === tilesA, `白色停战寸土不失（A 领土 ${tilesA} → ${A.tiles.length}）`);
  eng.rng = Math.random;
}

// ============ 3. 防抖：同一国本轮大战只有一次斡旋机会 ============
console.log('[3] 防抖：A 再次力竭 → 无人再劝 → 正常退出');
{
  A.pop = 15; // 继续恶化
  eng.rng = () => 0; // 即便概率全开也拦不住
  ok(eng.wwCapitulate(A) === true, 'wwCapitulate 返回 true（这次是真退出）');
  ok(!eng.worldWar.belligerents.includes(A.id), 'A 已退出参战名单');
  ok((eng.worldWar.capitulated ?? []).some((c) => c.id === A.id), '退出记录入 capitulated 账本');
  eng.rng = Math.random;
}

// ============ 4. 斡旋失败：照常力竭退出（仅补播事件） ============
console.log('[4] 斡旋失败：B 力竭 → M 斡旋失败 → 割地退出');
{
  eng.declareWar(B.id, C.id, 'annex', { force: true, total: true, quiet: true });
  eng.worldWar.pop0[B.id] = 100;
  B.pop = 20;
  const eventsBefore = eng.worldEvents.length;
  eng.rng = () => 0.9; // 斡旋者适格（不走神谕闸）但成功率闸失败（0.9 ≥ 0.5）
  ok(eng.wwCapitulate(B) === true, 'wwCapitulate 返回 true（退出流程照走）');
  ok(!eng.worldWar.belligerents.includes(B.id), 'B 已退出参战名单');
  ok(eng.wwMediated.has(B.id), '失败也记账（本轮大战不再有人为其斡旋）');
  const added = eng.worldEvents.slice(0, eng.worldEvents.length - eventsBefore).map((e) => e.text).join('|');
  ok(added.includes('调停失败'), `斡旋失败事件已播报（${added.slice(0, 40)}…）`);
  eng.rng = Math.random;
}

// ============ 5. 无适格斡旋者：中立国不够富 → 天降神谕（rng 高位则不发生） ============
console.log('[5] 无斡旋者边界：C 力竭时无适格富国（M 已 3× 门槛内？重置为贫国）');
{
  M.pop = 30; // 不再适格（< 60）
  eng.worldWar.pop0[C.id] = 100;
  C.pop = 20;
  eng.rng = () => 0.9; // 神谕闸 20% 不过（0.9 ≥ 0.2）→ 无斡旋
  ok(eng.wwCapitulate(C) === true, 'C 照常退出');
  ok(!eng.wwMediated.has(C.id), '无斡旋发生（未记账）');
  ok(!eng.worldWar.belligerents.includes(C.id), 'C 已退出');
  eng.rng = Math.random;
}

// ============ 6. 大战结束清零：wwMediated 随终战重置 ============
console.log('[6] 终局清零：大战结束 → 斡旋防抖表清空');
{
  ok(eng.wwMediated.size > 0, `终战前防抖表有账（${eng.wwMediated.size} 条）`);
  eng.endWorldWar(eng.civs[eng.worldWar.belligerents[0]] ?? M, false);
  ok(eng.worldWar.phase === 'ended', '大战已结束');
  ok(eng.wwMediated.size === 0, '防抖表随终战清空');
}

// ============ 7. 存档兼容：零新增序列化字段 ============
console.log('[7] 存档兼容：wwMediated 不入档');
{
  const save = eng.serialize('manual');
  const wwKeys = Object.keys(save.worldWar ?? {});
  ok(!wwKeys.includes('mediated') && !('wwMediated' in save), '存档无斡旋相关字段');
  const eng2 = new GameEngine(1);
  ok(eng2.wwMediated instanceof Set && eng2.wwMediated.size === 0, '新引擎冷启动即空表');
  ok(eng2.wwMediate(eng2.civs[0] ?? {}) === false, '无大战时 wwMediate 恒 false（前置闸）');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
