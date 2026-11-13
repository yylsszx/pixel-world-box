// #87 遗留池打磨轮单测：超限形态二笔 / 大道之争 / 矿脉枯竭速率参数化 / 外脑谕令第三通道
// 用法：node scripts/polish87-test.mjs
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
const { BUILD_KINDS, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { drawBuilding, drawBoat } = await jiti.import(path.join(ROOT, 'src/lib/game/sprites.ts'));
const { TECHS } = await jiti.import(path.join(ROOT, 'src/lib/game/tech.ts'));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const eng = new GameEngine(87001113);
const uA = eng.spawnUnit(R.HUMAN, 60, 60);
const civA = eng.civs[uA.civ];
const uB = eng.spawnUnit(R.ELF, 120, 120);
const civB = eng.civs[uB.civ];
ok(!!civA?.alive && !!civB?.alive && civA.id !== civB.id, '两国落地（人类/精灵）');

// ============ 1. 超限形态二笔：tier≥3 形态参数 + 像素分支可执行 ============
console.log('[1] 超限可视化二笔：tier≥3 几何形态（农田/兵营悬浮平台 + 航船能量船体）');
{
  // 超限路径：永筑之道 ×2 → 农田/兵营 tier = 基础 2 + 2 = 4（≥3 触发形态层）
  civA.techs = TECHS.map((t) => t.key);
  eng.techModCache.delete(civA.id);
  eng.setCivBrain(civA.id, { war: 0.05, build: 0.95, farm: 0.05, trade: 0.05, sea: 0.05, faith: 0.05 });
  const savedRng = eng.rng;
  eng.rng = () => 0.5; // 确定性注入：加权骰落在 build 频段（war 累计 0.05 < 0.5 ≤ 1.0）
  eng.fundInfResearch(civA, eng.infCost(civA));
  eng.fundInfResearch(civA, eng.infCost(civA));
  eng.rng = savedRng;
  ok(eng.infCount(civA, 'build') === 2, '两次超越均入永筑之道（确定性选道）');
  const farmTier = eng.buildTierOf(BUILD_KINDS.FARM, civA);
  const barTier = eng.buildTierOf(BUILD_KINDS.BARRACKS, civA);
  ok(farmTier >= 3, `农田超限阶位 ≥3（实测 ${farmTier}——悬浮农业平台层激活）`);
  ok(barTier >= 3, `兵营超限阶位 ≥3（实测 ${barTier}——能量炮塔环层激活）`);
  // 深蓝之道 → 航船 tier≥3（能量船体）
  eng.setCivBrain(civA.id, { war: 0.05, build: 0.05, farm: 0.05, trade: 0.05, sea: 0.95, faith: 0.05 });
  eng.rng = () => 0.5; // 落在 sea 频段
  eng.fundInfResearch(civA, eng.infCost(civA));
  eng.rng = savedRng;
  const nvTier = eng.navalTierOf(civA);
  ok(nvTier >= 3, `航船超限阶位 ≥3（实测 ${nvTier}——悬浮能量船体激活）`);
  // 像素分支可执行性：tier 3/4/5 逐档绘制不抛异常（stub ctx 捕获全部调用）
  const fakeB = { i: 1, x: 60, y: 60, kind: BUILD_KINDS.FARM, civ: civA.id };
  const fakeBar = { i: 2, x: 61, y: 61, kind: BUILD_KINDS.BARRACKS, civ: civA.id };
  const fakeBoat = { id: 9, race: R.HUMAN, civ: civA.id, x: 70, y: 70, tx: 70, ty: 70, hp: 10, maxHp: 10, dmg: 1, speed: 1, flip: false, caravan: 1, boat: 1 };
  let drew = false;
  try {
    for (const t of [3, 4, 5]) {
      drawBuilding(stubCtx, fakeB, [200, 60, 60], t, 1, 100, false, 0);
      drawBuilding(stubCtx, fakeBar, [200, 60, 60], t, 1, 100, false, 0);
      drawBoat(stubCtx, fakeBoat, [200, 60, 60], 120, t);
    }
    drew = true;
  } catch (e) { console.log('    绘制异常:', e.message); }
  ok(drew, '农田/兵营/航船 tier 3-5 像素分支全部可执行（无异常）');
  // tier 0-2 回归不受影响
  let drewBase = true;
  try { drawBuilding(stubCtx, fakeB, [200, 60, 60], 0, 1, 0, false, 0); drawBoat(stubCtx, fakeBoat, null, 0, 0); } catch { drewBase = false; }
  ok(drewBase, 'tier 0 基础形态回归可执行');
}

// ============ 2. 大道之争：道途异同的外交修正 ============
console.log('[2] 大道之争：同道加成 / 战神 vs 圣辉紧张 / 首触编年史');
{
  // 场景①：同道（双方都修战神 2 次）→ mod > 0
  civA.infHist = ['war', 'war']; civA.infEra = 2;
  civB.infHist = ['war', 'war']; civB.infEra = 2;
  const sameMod = eng.pathDiploMod(civA.id, civB.id);
  ok(Math.abs(sameMod - 0.06) < 1e-9, `同道途共同超越 ×2 → 修正 +0.06（实测 ${sameMod.toFixed(4)}）`);
  // 场景②：战神 vs 圣辉 → mod < 0
  civB.infHist = ['faith']; civB.infEra = 1;
  const tenseMod = eng.pathDiploMod(civA.id, civB.id);
  ok(tenseMod < -0.02, `战神 ×2 vs 圣辉 ×1 → 修正为负（实测 ${tenseMod.toFixed(4)}）`);
  // 未超越方 → 0（旧档/新文明不受影响）
  civB.infHist = undefined; civB.infEra = undefined;
  ok(eng.pathDiploMod(civA.id, civB.id) === 0, '一方未超越 → 修正 0（不炸不偏）');
  civB.infHist = ['faith']; civB.infEra = 1;
  // 宣战概率：异道途 > 同道途（warChance = 基础 - pathMod）
  civA.militarism = 30; civB.militarism = 30;
  const wcTense = eng.diploWarChance(civA.id, civB.id);
  civB.infHist = ['war', 'war']; civB.infEra = 2;
  const wcSame = eng.diploWarChance(civA.id, civB.id);
  ok(wcTense > wcSame, `异道途宣战概率高于同道途（紧张 ${wcTense.toFixed(3)} > 同道 ${wcSame.toFixed(3)}）`);
  // 首次异道途接触 → 'ascend' 大道之争编年史（只播一次）
  civB.infHist = ['faith']; civB.infEra = 1;
  const key0 = `${Math.min(civA.id, civB.id)}-${Math.max(civA.id, civB.id)}`;
  eng.met.delete(key0); eng.pathRiftMet.clear();
  const savedRng = eng.rng;
  eng.rng = () => 0.99; // 不开战 → 走关系分支（关系值也要受道途修正影响）
  eng.diplomacyMeet(civA.id, civB.id);
  eng.rng = savedRng;
  const riftEv = eng.worldEvents.filter((e) => e.kind === 'ascend' && e.text.includes('大道之争')).pop();
  ok(!!riftEv && riftEv.text.includes('战神之道') && riftEv.text.includes('圣辉之道'), '首触异道途 → 「大道之争」编年史（战神 vs 圣辉叙事）');
  const relTense = eng.rel.get(key0);
  eng.met.delete(key0);
  civB.infHist = ['war', 'war']; civB.infEra = 2;
  eng.rng = () => 0.99;
  eng.diplomacyMeet(civA.id, civB.id);
  eng.rng = savedRng;
  ok(eng.rel.get(key0) > relTense, `同道首触关系高于异道首触（${eng.rel.get(key0)} > ${relTense}）`);
  const riftN = eng.worldEvents.filter((e) => e.kind === 'ascend' && e.text.includes('大道之争')).length;
  ok(riftN === 1, '大道之争播报去重（同对只播一次）');
}

// ============ 3. 矿脉枯竭速率参数化 ============
console.log('[3] 矿脉枯竭速率：0 永不 / 1 正常 / 2 快速 + 存档兼容');
{
  // 找一处矿脉 + 手工放矿井（注册 bIdx —— destroyBuilding 走 bIdx 索引）
  let mineI = -1;
  for (let i = 0; i < eng.ore.length; i++) { if (eng.ore[i] >= 1 && !eng.oreOut.has(i)) { mineI = i; break; } }
  ok(mineI >= 0, `找到矿脉格（idx ${mineI}）`);
  const bx = mineI % 256, by = Math.floor(mineI / 256);
  const mineCiv = eng.civs[civB.id]; // 精灵国：无科技无超限 → 矿井 tier 0（无塌方通道，纯测枯竭闸）
  const placeMine = () => {
    eng.buildings.push({ i: mineI, x: bx, y: by, y0: 0, kind: BUILD_KINDS.MINE, civ: mineCiv.id, builtTick: eng.tickCount });
    eng.bIdx.set(mineI, eng.buildings.length - 1);
    eng.bHp.set(mineI, 100);
  };
  placeMine();
  // 档 0：永不枯竭（首掷极小也绝不命中枯竭；次掷不中塌方）
  eng.oreDepletion = 0;
  const savedRng = eng.rng;
  let c0 = 0;
  eng.rng = () => { c0++; return c0 === 1 ? 0 : 0.99; }; // 必中骰（若速率闸失效即枯竭）
  eng.mineCollapseTick();
  eng.rng = savedRng;
  ok(eng.buildings.some((b) => b.i === mineI) && !eng.oreOut.has(mineI), '档 0（永不枯竭）：必中骰下矿井无恙');
  // 档 2：快速（0.02 骰 > 1.2%×1 但 < 1.2%×2 → 枯竭）
  eng.oreDepletion = 2;
  let calls = 0;
  eng.rng = () => { calls++; return calls === 1 ? 0.02 : 0.99; };
  eng.mineCollapseTick();
  eng.rng = savedRng;
  ok(eng.oreOut.has(mineI) && eng.ore[mineI] === 0 && !eng.buildings.some((b) => b.i === mineI), '档 2（快速）：2% 骰命中枯竭（正常档不会）');
  // 档 1 回归：0.02 骰不命中（1.2% 阈值）
  eng.oreDepletion = 1;
  eng.oreOut.delete(mineI);
  placeMine();
  let c1 = 0;
  eng.rng = () => { c1++; return c1 === 1 ? 0.02 : 0.99; };
  eng.mineCollapseTick();
  eng.rng = savedRng;
  ok(eng.buildings.some((b) => b.i === mineI), '档 1（正常）：2% 骰不中 1.2% 阈值——原速率不变');
  // 存档往返 + 旧档兼容（applySave 重建 civs——引用须重取）
  const sv = eng.serialize('manual');
  ok(sv.oreDepletion === 1, '存档携带 oreDepletion');
  sv.oreDepletion = 0;
  eng.applySave(sv);
  ok(eng.oreDepletion === 0, '读档恢复档位 0');
  const legacy = eng.serialize('manual');
  delete legacy.oreDepletion; // 旧档无字段
  eng.applySave(legacy);
  ok(eng.oreDepletion === 1, '旧档无字段 → 回退缺省 1（不炸）');
}

// ============ 4. 外脑谕令第三通道 ============
console.log('[4] 外脑谕令：白名单 / 限时效果 / 过期回退 + 存档兼容');
{
  const A = eng.civs[civA.id]; // applySave 重建 civs——引用重取（沙箱沉淀坑镜像）
  const B = eng.civs[civB.id];
  // 白名单外拒收（引擎二道闸；路由白名单外静默丢弃）
  ok(eng.setCivDirective(civA.id, 'total-war') === null, '白名单外谕令被拒（null）');
  ok(eng.setCivDirective(civA.id, 42) === null, '非字符串谕令被拒');
  ok(A.directive === undefined, '被拒谕令不落库');
  // 合法令落地：偃武令 10 年
  const d = eng.setCivDirective(A.id, 'seek-peace');
  ok(d && d.kind === 'seek-peace' && d.untilTick === eng.tickCount + 10 * 40, '偃武令落地（10 年 = 400 tick 时效）');
  ok(eng.activeCivDirective(A.id) === 'seek-peace', 'activeCivDirective 生效期内可查');
  const decEv = eng.worldEvents.filter((e) => e.kind === 'decree').pop();
  ok(!!decEv && decEv.text.includes('偃武令'), '谕令入编年史（decree 事件）');
  // 效果：偃武令使开战概率 -0.1（拉高军国主义避开 0.08 下限钳位；中枢人格归缺省）
  A.militarism = 90; B.militarism = 90;
  B.infHist = undefined; B.infEra = undefined; // 排除大道之争干扰
  A.directive = undefined;
  const wcWithout = eng.diploWarChance(A.id, B.id);
  eng.setCivDirective(A.id, 'seek-peace');
  const wcWith = eng.diploWarChance(A.id, B.id);
  ok(Math.abs((wcWithout - wcWith) - 0.1) < 1e-9, `偃武令 → 开战概率 -0.1（${wcWithout.toFixed(3)} → ${wcWith.toFixed(3)}）`);
  // 过期回退：tickCount 推进到时效之后 → 自动失效
  eng.setCivDirective(A.id, 'focus-research');
  const until = A.directive.untilTick;
  eng.tickCount = until + 1; // 推进（后续长跑前会归位）
  ok(eng.activeCivDirective(A.id) === null, '时效已过 → 谕令自动失效（效果链全部回退）');
  // 存档兼容：civs 展开携带 + 旧档剥离不炸
  eng.tickCount = until - 10; // 回到时效内
  const sv2 = eng.serialize('manual');
  ok(sv2.civs.find((c) => c.id === A.id)?.directive?.kind === 'focus-research', '存档携带谕令（civs 展开自动序列化）');
  eng.applySave(sv2);
  ok(eng.activeCivDirective(A.id) === 'focus-research', '读档后谕令仍生效');
  const legacy2 = eng.serialize('manual');
  for (const c of legacy2.civs) delete c.directive;
  eng.applySave(legacy2);
  ok(eng.activeCivDirective(A.id) === null, '旧档剥离 directive 字段 → 读档不炸（回退无谕令）');
}

// ============ 5. 长跑冒烟：600 tick 无异常 ============
console.log('[5] 长跑冒烟：600 tick');
{
  eng.oreDepletion = 1;
  let err = null;
  const t0 = Date.now();
  try { for (let i = 0; i < 600; i++) eng.tick(); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  ok(err === null, `600 tick 无异常（${ms}ms，${(ms / 600).toFixed(2)}ms/tick）${err ? '—— ' + err.message : ''}`);
}

console.log(`\n===== #87 打磨轮单测：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
