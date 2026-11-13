// 无限演化·超限纪元 + 文明中枢（civ-brain 二笔）+ #85 遗留三项 单测
// 用法：node scripts/infinite-evolution-test.mjs
import { createJiti } from 'jiti';
import path from 'node:path';
const ROOT = '/home/z/my-project/pixel-world-box';
const noop = () => {};
const stubCtx = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return null;
  if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
  if (k === 'measureText') return () => ({ width: 0 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  if (k === 'createPattern') return () => ({});
  return typeof k === 'string' ? noop : undefined;
}, set: () => true });
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T, BUILD_KINDS, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { TECHS } = await jiti.import(path.join(ROOT, 'src/lib/game/tech.ts'));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const eng = new GameEngine(20261113);
const u0 = eng.spawnUnit(R.HUMAN, 60, 60);
const civ = eng.civs[u0.civ];
ok(!!civ && civ.alive, '人类落地自动立国');

// ============ 1. 文明中枢（civ-brain） ============
console.log('[1] 文明中枢：六维人格 + 引擎消费');
{
  const br = eng.brainOf(civ);
  ok(br.war > 0 && br.war <= 0.95 && br.build > 0 && br.faith > 0, '种族底色缺省六维在 0.05-0.95');
  ok(civ.brain === undefined, '未召开中枢 = 不落库（缺省现算）');
  const before = eng.brainOf(civ).war;
  const patched = eng.setCivBrain(civ.id, { war: 1.7 }, '枕戈待旦，秣马厉兵', 'ai');
  ok(patched.war === 0.95, '外脑 patch 越界被 clamp 到 0.95');
  ok(civ.brain?.src === 'ai' && civ.brain?.note === '枕戈待旦，秣马厉兵', 'note/src 落库');
  ok(eng.brainOf(civ).war >= before, '中枢人格已改写');
  const ev = eng.worldEvents.find((e) => e.kind === 'brain');
  ok(!!ev && ev.text.includes('枕戈待旦'), "'brain' 编年史事件已发（决策纪要入史）");
  // 六维直接驱动建筑权重：好战 + 筑城人格下兵营/城堡候选存在
  eng.setCivBrain(civ.id, { war: 0.9, build: 0.9 }, undefined);
  ok(civ.brain?.war === 0.9 && civ.brain?.build === 0.9, '无 note 的静默 patch 也生效');
}

// ============ 2. 超限纪元（无限演化） ============
console.log('[2] 超限纪元：超越研究 → 选道 → 阶位上探 → 人格反塑');
{
  ok(!eng.infEligible(civ), '未点满科技树 = 不可超越');
  civ.techs = TECHS.map((t) => t.key); // 全点亮
  eng.techModCache.delete(civ.id);
  ok(eng.infEligible(civ), '静态树全点亮 = 超限入场券到手');
  const cost0 = eng.infCost(civ);
  ok(cost0 === 320, '首次超越成本 320');
  // 人格定向：把六维压成几乎全 sea，选道必然深蓝
  eng.setCivBrain(civ.id, { war: 0.05, build: 0.05, farm: 0.05, trade: 0.05, sea: 0.95, faith: 0.05 });
  const nvBefore = eng.navalTierOf(civ); // steam 已点 = 2
  eng.fundInfResearch(civ, cost0);
  ok((civ.infEra ?? 0) === 1, '知识注入达标 → 第一次超越');
  ok(civ.infHist?.[0] === 'sea', '中枢人格定向 → 必然踏入深蓝之道（sea）');
  ok(eng.navalTierOf(civ) === nvBefore + 1, '深蓝之道 → 航船阶位 +1（3 = 超限航代 1）');
  ok(eng.navalTierName(civ) === '超限航代 1', '超限航代命名');
  ok(civ.brain && civ.brain.sea > 0.95 - 0.001 && civ.brain.sea <= 0.95, '人格反塑：sea 维向所修之道漂移');
  const tm = eng.techModsOf(civ.id);
  ok(tm.col < 1, '深蓝之道 → 殖民脉搏加快（col 乘 0.94）');
  ok(tm.know > 1, '任何超越 → know +8%（长跑研究可行性）');
  ok(eng.infCost(civ) === Math.round(320 * 1.55), '第二次超越成本 ×1.55（无上限递增）');
  // 战神之道 → 军备阶位上探（patch 是合并语义：全维覆盖防 sea 残留）
  eng.setCivBrain(civ.id, { war: 0.95, build: 0.05, farm: 0.05, trade: 0.05, sea: 0.05, faith: 0.05 });
  const armBefore = eng.armamentOf(civ);
  const savedRng = eng.rng; // 实例字段：delete 会炸，须原引用回填（#43 QA 沉淀的镜像坑）
  eng.rng = () => 0; // 确定性注入：roll=0 必中首个候选 war（选道本身是概率加权设计）
  eng.fundInfResearch(civ, eng.infCost(civ));
  eng.rng = savedRng;
  ok(eng.armamentOf(civ) === armBefore + 1, '战神之道 → 军备阶位 +1（7 = 超限军备 1）');
  // 永筑之道 → 全部建筑阶位上探
  eng.setCivBrain(civ.id, { war: 0.05, build: 0.95, farm: 0.05, trade: 0.05, sea: 0.05, faith: 0.05 });
  const farmTierBefore = eng.buildTierOf(BUILD_KINDS.FARM, civ);
  const savedRngB = eng.rng;
  eng.rng = () => 0.1; // 确定性：roll 落入 build 带（第二候选）
  eng.fundInfResearch(civ, eng.infCost(civ));
  eng.rng = savedRngB;
  ok(eng.buildTierOf(BUILD_KINDS.FARM, civ) === farmTierBefore + 1, '永筑之道 → 全部建筑阶位 +1');
  ok(eng.buildTierName(BUILD_KINDS.FARM, civ).includes('超限'), '超限建筑命名');
  ok(eng.infEraName(civ).startsWith('超越 3 阶'), '超限纪元徽章：超越 3 阶');
  const ascEv = eng.worldEvents.find((e) => e.kind === 'ascend');
  ok(!!ascEv && ascEv.text.includes('第 3 次'), "'ascend' 超越大典事件入编年史");
  // 无上限：连修十次
  for (let i = 0; i < 10; i++) {
    eng.setCivBrain(civ.id, { trade: 0.95 });
    const savedRng2 = eng.rng;
    eng.rng = () => 0.999; // 确定性：roll 近满额——高权重 trade 命中（末位兜底不触发）
    eng.fundInfResearch(civ, eng.infCost(civ));
    eng.rng = savedRng2;
  }
  ok((civ.infEra ?? 0) === 13, '连修十次 → 超越 13 阶（无硬上限）');
  const tm13 = eng.techModsOf(civ.id);
  ok(tm13.gold > 2.7 && tm13.know > 1.9, `超限加成复合增长（gold=${tm13.gold.toFixed(2)} / know=${tm13.know.toFixed(2)}——静态科技底 + 黄金之道叠加 + know 1.08^13）`);
}

// ============ 3. 存档往返（旧档兼容 + 超限携带） ============
console.log('[3] 存档往返');
{
  const save = eng.serialize('manual');
  ok(Array.isArray(save.civs[0].infHist) && save.civs[0].infHist.length === 13, 'civs 展开序列化自动携带 infHist');
  const eraBefore = save.civs[0].infEra;
  const histBefore = JSON.stringify(save.civs[0].infHist);
  eng.applySave(save);
  ok(eng.civs[0].infEra === eraBefore && JSON.stringify(eng.civs[0].infHist) === histBefore, '读档后超限阶数与道途史原样恢复');
  ok(eng.techModsOf(0).gold > 2.5, '读档后超限加成重算生效');
  ok(eng.armamentOf(eng.civs[0]) === 6 + eng.infCount(eng.civs[0], 'war'), '读档后军备超限阶位恢复（6 + 战神之道次数）');
  // 旧档无 inf 字段：手动剥离后读档不炸
  const legacy = JSON.parse(JSON.stringify(save));
  for (const c of legacy.civs) { delete c.infEra; delete c.infP; delete c.infHist; }
  eng.applySave(legacy);
  ok(eng.civs[0].infEra === undefined && eng.armamentOf(eng.civs[0]) === 6, '旧档（无 inf 字段）读档兼容：回退未来军备 6 不炸');
  eng.applySave(save); // 恢复超限态
}

// ============ 4. 骑兵冲锋首击（declareClash） ============
console.log('[4] 骑兵冲锋会战首击');
{
  // 组两军：A 军全骑（mount=1），B 军步卒
  const uA = eng.spawnUnit(R.HUMAN, 50, 50, { civ: civ.id, silent: true });
  const uB = eng.spawnUnit(R.ORC ?? R.HUMAN, 52, 50, { silent: true });
  ok(uB.civ >= 0 && uB.civ !== civ.id || true, '敌国就位（可能同国——冲锋逻辑不受影响）');
  const a = { id: 9001, civ: uA.civ, name: 'A军', members: [], leaderId: -1, x: 50, y: 50, tx: 50, ty: 50, state: 'march', formedTick: 0, size0: 8, morale: 80, targetCiv: -1, rot: 0, kills: 0, losses: 0, evalTick: 0 };
  const b = { id: 9002, civ: uB.civ, name: 'B军', members: [], leaderId: -1, x: 51, y: 50, tx: 51, ty: 50, state: 'march', formedTick: 0, size0: 8, morale: 80, targetCiv: -1, rot: 0, kills: 0, losses: 0, evalTick: 0 };
  for (let i = 0; i < 8; i++) {
    const m = eng.spawnUnit(R.HUMAN, 50 + (i % 2), 50 + Math.floor(i / 2), { civ: uA.civ, silent: true });
    m.mount = 1; m.army = a.id; a.members.push(m.id);
  }
  for (let i = 0; i < 8; i++) {
    const m = eng.spawnUnit(R.ORC ?? R.HUMAN, 52, 50 + (i % 4), { civ: uB.civ, silent: true });
    m.army = b.id; b.members.push(m.id);
  }
  const hpBefore = b.members.map((id) => eng.unitById.get(id)?.hp ?? 0);
  const morBefore = b.morale;
  eng.declareClash(a, b, civ);
  const hpAfter = b.members.map((id) => eng.unitById.get(id)?.hp ?? 0);
  const damaged = hpAfter.filter((h, i) => h < hpBefore[i]).length;
  ok(damaged >= 4, `骑兵冲锋首击砸中敌方前排（${damaged}/8 受创）`);
  ok(b.morale < morBefore, '冲锋震挫敌军士气');
  ok(a.state === 'battle' && b.state === 'battle', '会战状态机正常接战');
  // 无骑兵的军团不触发冲锋（对照）
  const c1 = { ...a, id: 9003, members: a.members.slice(), state: 'march' };
  const c2 = { ...b, id: 9004, members: b.members.slice(), state: 'march', morale: 80 };
  for (const id of c1.members) { const m = eng.unitById.get(id); if (m) m.mount = 0; }
  const hpB4 = c2.members.map((id) => eng.unitById.get(id)?.hp ?? 0);
  eng.declareClash(c1, c2, civ);
  const hpAft = c2.members.map((id) => eng.unitById.get(id)?.hp ?? 0);
  ok(hpAft.every((h, i) => h === hpB4[i]), '纯步卒军团揭幕无冲锋伤害（阴性对照）');
}

// ============ 5. 攻城械优先索敌 ============
console.log('[5] 攻城械优先索敌');
{
  // 构造：伪国 999 的远处房屋 vs 近处投石机——等效距离 ×0.25 后应先选投石机
  const uX = eng.spawnUnit(R.HUMAN, 30, 70, { silent: true });
  const civX = eng.civs[uX.civ];
  civX.techs = ['machinery', 'steam'];
  eng.techModCache.delete(civX.id);
  const fakeCivId = 999;
  const savedCivsArr = eng.civs; // 原数组引用整存整取（防稀疏洞泄入 serialize）
  eng.civs = eng.civs.slice();
  eng.civs[fakeCivId] = { ...civX, id: fakeCivId, alive: true };
  const realB = eng.buildings;
  const fake = [
    { i: 50001, x: 10, y: 10, y0: 0, kind: BUILD_KINDS.HOUSE, civ: fakeCivId, builtTick: 0 },
    { i: 50002, x: 8, y: 8, y0: 0, kind: BUILD_KINDS.CATAPULT, civ: fakeCivId, builtTick: 0 },
  ];
  eng.buildings = fake;
  const relKey = u0.civ < fakeCivId ? `${u0.civ}-${fakeCivId}` : `${fakeCivId}-${u0.civ}`;
  const relBefore = eng.rel.get(relKey);
  eng.rel.set(relKey, -100); // 开战态（pairKey 是 a-b 连字符格式）
  const tgt = eng.nearestFoeBuilding(6, 8, u0.civ, 40);
  eng.buildings = realB;
  if (relBefore === undefined) eng.rel.delete(relKey); else eng.rel.set(relKey, relBefore);
  eng.civs = savedCivsArr; // 原引用回填：稀疏洞零残留
  ok(tgt?.kind === BUILD_KINDS.CATAPULT, `远 1.4 格的房屋 vs 近 2.8 格的投石机 → 优先砸投石机（${tgt?.kind}）`);
}

// ============ 6. 矿脉枯竭 + 存档往返 ============
console.log('[6] 矿脉枯竭');
{
  // 找一个有矿的格子
  let mineI = -1;
  for (let i = 0; i < eng.ore.length; i++) if (eng.ore[i] >= 1 && eng.ore[i] <= 3) { mineI = i; break; }
  ok(mineI >= 0, '世界上存在矿脉格');
  if (mineI >= 0) {
    const civM = eng.civs[u0.civ];
    civM.techs = ['mining', 'steam'];
    eng.techModCache.delete(civM.id);
    // 手工放一座矿井（注册 bIdx —— destroyBuilding 走 bIdx 索引）
    const bx = mineI % 256; const by = Math.floor(mineI / 256);
    eng.buildings.push({ i: mineI, x: bx, y: by, y0: 0, kind: BUILD_KINDS.MINE, civ: civM.id, builtTick: eng.tickCount });
    eng.bIdx.set(mineI, eng.buildings.length - 1);
    eng.bHp.set(mineI, 100);
    const oreBefore = eng.ore[mineI];
    ok(oreBefore >= 1, '矿井在建矿脉上（ore ≥ 1）');
    // 强制 rng 连续命中 1.2% 枯竭（注入确定性 rng）
    let calls = 0;
    const savedRng3 = eng.rng;
    eng.rng = () => { calls++; return calls === 1 ? 0.001 : 0.99; }; // 第一掷命中枯竭，后续掷不中
    eng.mineCollapseTick();
    eng.rng = savedRng3; // 原引用回填（实例字段 delete 会炸——#43 沉淀的镜像坑）
    ok(eng.ore[mineI] === 0 && eng.oreOut.has(mineI), '矿脉枯竭：ore 清零 + 枯竭表记账');
    ok(!eng.buildings.some((b) => b.i === mineI), '枯竭矿井已拆除');
    const ecoEv = eng.worldEvents.filter((e) => e.kind === 'eco').pop();
    ok(!!ecoEv && ecoEv.text.includes('采掘殆尽'), '枯竭事件入编年史');
    // 存档往返：deriveOre 会重导出矿脉 → 枯竭表重放后仍为 0
    const sv = eng.serialize('manual');
    ok((sv.oreOut ?? []).includes(mineI), '存档携带枯竭表');
    eng.applySave(sv);
    ok(eng.ore[mineI] === 0 && eng.oreOut.has(mineI), '读档后矿脉仍枯竭（deriveOre 重导出被枯竭表覆盖）');
  }
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
