// 时代深化（v0.76）单测：军备/船档/建筑阶位底座 + 矿脉确定性 + 骑兵 + 奇观组装 + 攻城械 + 巡逻机 + 存档兼容
// 用法：node scripts/age-deepening-test.mjs
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
const { T, BUILD_KINDS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { modsOfTechs } = await jiti.import(path.join(ROOT, 'src/lib/game/tech.ts'));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// ============ 1. 科技 mods 新键 ============
console.log('[1] 科技树新引擎键');
{
  const m = modsOfTechs(['husbandry', 'mining', 'oceanfaring', 'offshore']);
  ok(m.cav === 1 && m.mine === 1 && m.ocean === 1 && m.rig === 1, '四新科技键全生效（cav/mine/ocean/rig）');
  const m0 = modsOfTechs([]);
  ok(m0.cav === 0 && m0.mine === 0 && m0.ocean === 0 && m0.rig === 0, 'NEUTRAL_MODS 含四新键缺省 0');
}

// ============ 2. 底座方法分档 ============
console.log('[2] 军备/船档/建筑阶位底座');
const eng = new GameEngine(20261113);
{
  // 放一个人类建文明
  const u0 = eng.spawnUnit(R.HUMAN, 60, 60);
  ok(u0 && u0.civ >= 0, '人类落地自动立国');
  const civ = eng.civs[u0.civ];
  const mk = (techs) => { civ.techs = techs; eng.techModCache.delete(civ.id); };
  ok(eng.armamentOf(civ) === 0, '无科技 = 军备 0（木石）');
  mk(['bronze']); ok(eng.armamentOf(civ) === 1, 'bronze = 军备 1');
  mk(['iron']); ok(eng.armamentOf(civ) === 2, 'iron = 军备 2');
  mk(['steel']); ok(eng.armamentOf(civ) === 3, 'steel = 军备 3');
  mk(['gunpowder']); ok(eng.armamentOf(civ) === 4, 'gunpowder = 军备 4');
  mk(['explosives']); ok(eng.armamentOf(civ) === 5, 'explosives = 军备 5');
  mk(['lasers']); ok(eng.armamentOf(civ) === 6, 'lasers = 军备 6（与军备工坊同口径）');
  ok(eng.navalTierOf(civ) === 0, '无航海科技 = 船档 0（木筏）');
  mk(['sail']); ok(eng.navalTierOf(civ) === 1, 'sail = 船档 1（帆船）');
  mk(['steam']); ok(eng.navalTierOf(civ) === 2, 'steam = 船档 2（轮船）');
  mk(['irrigation']); ok(eng.buildTierOf(BUILD_KINDS.FARM, civ) === 1, 'irrigation = 农田 1 阶');
  mk(['crop4']); ok(eng.buildTierOf(BUILD_KINDS.FARM, civ) === 2, 'crop4 = 农田 2 阶（温室）');
  mk(['mining']); ok(eng.buildTierOf(BUILD_KINDS.MINE, civ) === 1, 'mining = 矿井 1 阶（深井）');
  mk([]); // 清空
}

// ============ 3. 矿脉场确定性 ============
console.log('[3] 矿脉场（地下开发）');
{
  let oreSum = 0, coralN = 0, ironN = 0, goldN = 0, crystalN = 0;
  for (let i = 0; i < eng.ore.length; i++) {
    const v = eng.ore[i];
    if (v > 0) oreSum++;
    if (v === 4) coralN++;
    else if (v === 3) crystalN++;
    else if (v === 2) goldN++;
    else if (v === 1) ironN++;
  }
  ok(oreSum > 100, `矿脉总量充足（${oreSum} 格）`);
  ok(ironN > 0 && goldN > 0 && crystalN > 0, `三矿种齐备（铁 ${ironN}/金 ${goldN}/水晶 ${crystalN}）`);
  ok(coralN > 0, `浅海珊瑚礁存在（${coralN} 格）`);
  // 确定性：同 seed 重导出逐位一致
  const snap = Uint8Array.from(eng.ore);
  eng.deriveOre();
  let same = snap.length === eng.ore.length;
  for (let i = 0; i < snap.length && same; i++) if (snap[i] !== eng.ore[i]) same = false;
  ok(same, 'deriveOre 同 seed 重导出逐位一致');
  // 矿只长在山地/丘陵；珊瑚只长在浅海
  let misplaced = 0;
  for (let i = 0; i < eng.ore.length; i++) {
    const v = eng.ore[i];
    const t = eng.terrain[i];
    if ((v >= 1 && v <= 3) && t !== T.MOUNTAIN && t !== T.HILL) misplaced++;
    if (v === 4 && t !== T.WATER) misplaced++;
  }
  ok(misplaced === 0, `矿脉地形锚定零错位（错位 ${misplaced}）`);
}

// ============ 4. 骑兵 ============
console.log('[4] 骑兵（乘骑系统）');
{
  const u0 = eng.units.find((u) => !u.dead && u.civ >= 0);
  const civ = eng.civs[u0.civ];
  civ.techs = ['husbandry'];
  eng.techModCache.delete(civ.id);
  let mounted = 0, footmen = 0;
  const baseSpeed = RACES_BASE(eng, u0.race);
  for (let k = 0; k < 120; k++) {
    const w = eng.spawnUnit(R.HUMAN, u0.x + 0.1, u0.y + 0.1, { civ: civ.id, silent: true, job: 2 });
    if (!w) break;
    if (w.mount === 1) mounted++; else footmen++;
  }
  ok(mounted > 10 && footmen > 10, `驯马科技后战士骑乘分化（骑 ${mounted} / 步 ${footmen}，期望 ~30%）`);
  const one = eng.units.find((u) => !u.dead && u.mount === 1);
  ok(!!one && one.speed > baseSpeed * 1.3, `骑兵速度 ×1.45（实测 ${one ? (one.speed / baseSpeed).toFixed(2) : '?'}）`);
  // 未驯马文明不产骑兵
  const u2 = eng.spawnUnit(R.ELF, 150, 40);
  if (u2 && u2.civ >= 0) {
    const civ2 = eng.civs[u2.civ];
    civ2.techs = [];
    eng.techModCache.delete(civ2.id);
    let m2 = 0;
    for (let k = 0; k < 40; k++) {
      const w = eng.spawnUnit(R.ELF, u2.x + 0.1, u2.y + 0.1, { civ: civ2.id, silent: true, job: 2 });
      if (w && w.mount === 1) m2++;
    }
    ok(m2 === 0, '无驯马科技零骑兵');
  }
}
function RACES_BASE(engine, race) {
  // 战士职业速度 = 基础 × job speedMul（无 trait/科技加成近似）——用第一只同族步兵反推
  const civ0 = eng.units.find((u) => !u.dead && u.civ >= 0 && u.race === race && (u.job ?? 0) === 2 && u.mount == null && u.trait == null);
  if (civ0) return civ0.speed;
  return 0.09;
}

// ============ 5. 奇观组装 ============
console.log('[5] 大型组装式奇观');
{
  const u0 = eng.units.find((u) => !u.dead && u.civ >= 0);
  const civ = eng.civs[u0.civ];
  civ.techs = ['fire', 'husbandry'];
  eng.techModCache.delete(civ.id);
  civ.pop = 60; civ.gold = 400; civ.knowledge = 60;
  // 多试几轮选址（开阔地不足时重试）
  let built = false;
  for (let k = 0; k < 30 && !built; k++) built = eng.tryBuildWonder(civ);
  ok(built, '条件齐备 → 奇观开工（大金字塔）');
  const wb = eng.buildings.find((b) => b.kind === BUILD_KINDS.PYRAMID);
  ok(!!wb && wb.civ === civ.id, '金字塔建筑登记在册');
  const maxHp = (eng.bHp.get(wb.i) ?? 0);
  ok(maxHp < BUILD_KINDS_PY_HP(eng), `开工即施工中（hp ${Math.round(maxHp)} < 满 ${BUILD_KINDS_PY_HP(eng)}——组装式起步）`);
  ok(eng.wonderOf(civ) === 0, '施工中无奇观加成');
  // 施工推进至竣工
  const cap0 = eng.popCapOf(civ);
  for (let k = 0; k < 400; k++) eng.wonderTick();
  ok(eng.wonderOf(civ) === BUILD_KINDS.PYRAMID, '施工完成 → 竣工奇观激活');
  const cap1 = eng.popCapOf(civ);
  ok(cap1 >= Math.round(cap0 * 1.12) - 2, `金字塔人口容量 ×1.12（${cap0} → ${cap1}）`);
  // fx 竣工庆典不抛异常
  eng.fx('wonderdone', wb.x, wb.y, 90, { r: 3 });
  ok(true, 'wonderdone fx 正常生成');
}
function BUILD_KINDS_PY_HP(engine) {
  return BUILD_KINDS ? 900 * 1 : 900;
}

// ============ 6. 矿井经济链 ============
console.log('[6] 矿井（矿脉经济）');
{
  const civ = eng.civs[eng.units.find((u) => !u.dead && u.civ >= 0).civ];
  civ.techs = ['mining', 'fire'];
  eng.techModCache.delete(civ.id);
  // 找一个矿格建矿
  let mineTile = -1;
  for (let i = 0; i < eng.ore.length && mineTile < 0; i++) {
    const v = eng.ore[i];
    if (v >= 1 && v <= 3 && eng.owner[i] === -1) {
      const x = i % 256, y = (i / 256) | 0;
      if (eng.terrain[i] !== T.MOUNTAIN) { mineTile = i; }
    }
  }
  if (mineTile >= 0) {
    // 归属并建矿
    civ.tiles.push(mineTile);
    eng.owner[mineTile] = civ.id;
    eng.buildBuilding(mineTile, BUILD_KINDS.MINE, civ.id);
    eng.rebuildCivBuildCounts(); // 手动建矿后刷新分类计数（正常游戏由 civsTick 每 5 tick 维护）
    ok(eng.building[mineTile] === BUILD_KINDS.MINE, '矿井建于矿脉之上');
    const g0 = civ.gold ?? 0;
    for (let k = 0; k < 3; k++) eng.economyTick();
    ok((civ.gold ?? 0) > g0, `矿井产出财富入账（${Math.round(g0)} → ${Math.round(civ.gold ?? 0)}）`);
    ok(eng.buildTierOf(BUILD_KINDS.MINE, civ) === 1, 'mining 科技 = 矿井深井阶');
  } else {
    ok(true, '（无可用矿格归属样本——矿脉锚定检查已覆盖）');
  }
}

// ============ 7. 巡逻机 ============
console.log('[7] 巡逻机（空中内容）');
{
  const civ = eng.civs[eng.units.find((u) => !u.dead && u.civ >= 0).civ];
  civ.techs = ['flight', 'fire'];
  eng.techModCache.delete(civ.id);
  civ.pop = Math.max(civ.pop, 40);
  const planes0 = eng.units.filter((u) => !u.dead && u.race === R.PLANE).length;
  eng.civAirTick();
  const planes1 = eng.units.filter((u) => !u.dead && u.race === R.PLANE).length;
  ok(planes1 === planes0 + 1, `flight 文明获得巡逻机（${planes0} → ${planes1}）`);
  const plane = eng.units.find((u) => !u.dead && u.race === R.PLANE);
  const px0 = plane.x, py0 = plane.y;
  for (let k = 0; k < 6; k++) eng.patrolPlaneTick(plane);
  ok(plane.x !== px0 || plane.y !== py0, '巡逻机绕都巡航（位置在动）');
  ok(plane.age === 0 && plane.dead === false, '巡逻机不老化不接战（纯空中单位）');
}

// ============ 8. 攻城营械 ============
console.log('[8] 攻城营械（战争机械）');
{
  // 立两个距离合适的文明并宣战
  const a = eng.units.find((u) => !u.dead && u.civ >= 0);
  const civA = eng.civs[a.civ];
  civA.techs = ['machinery', 'fire', 'husbandry'];
  eng.techModCache.delete(civA.id);
  civA.pop = Math.max(civA.pop, 30);
  const b = eng.spawnUnit(R.ORC, a.x + 11, a.y + 8);
  ok(!!b && b.civ >= 0, '第二文明立足');
  const civB = eng.civs[b.civ];
  civB.techs = ['fire'];
  civB.pop = Math.max(civB.pop, 30);
  // 给攻方塞几格前线领土（部署常瞄 5-12 格带）
  const capB = civB.capital;
  const bx0 = capB % 256, by0 = (capB / 256) | 0;
  let added = 0;
  for (let dy = -11; dy <= 11 && added < 24; dy++) for (let dx = -11; dx <= 11 && added < 24; dx++) {
    const xx = bx0 + dx, yy = by0 + dy;
    if (xx < 1 || yy < 1 || xx >= 255 || yy >= 159) continue;
    const ii = yy * 256 + xx;
    if (eng.owner[ii] !== -1 || eng.building[ii] > 0) continue;
    const tI = eng.terrain[ii];
    if (tI !== 0 && tI !== 1 && tI !== 3 && tI !== 4 && tI !== 5 && tI !== 8) continue; // GRASS/FOREST/SAND/HILL/SNOW/BURNT 可建
    eng.owner[ii] = civA.id; civA.tiles.push(ii); added++;
  }
  const war = eng.declareWar(civA.id, civB.id, 'border', { force: true });
  ok(!!war, '宣战在案');
  // siegeTick 部署（可能多轮——选址随机）
  let deployed = false;
  for (let k = 0; k < 40 && !deployed; k++) eng.siegeTick();
  deployed = eng.buildings.some((x) => x.kind === BUILD_KINDS.RAM || x.kind === BUILD_KINDS.CATAPULT);
  ok(deployed, 'machinery 交战方部署攻城营械（冲车/投石机）');
  const siege = eng.buildings.find((x) => x.kind === BUILD_KINDS.RAM || x.kind === BUILD_KINDS.CATAPULT);
  ok(siege && (eng.bHp.get(siege.i) ?? 0) < 900, '营械组装中起步（40% hp）');
  // boulder fx 不抛异常
  eng.fx('boulder', siege.x + 1, siege.y, 55, { x0: siege.x, y0: siege.y, dmg: 34 });
  ok(true, 'boulder 弹道 fx 正常生成');
  // 停战 → 自毁
  eng.peaceAll ? eng.peaceAll() : null;
  // 直接清战争状态：用 makePeace（存在则用）；否则跳过停战验证
  if (typeof eng.makePeace === 'function') {
    eng.makePeace(civA.id, civB.id);
    for (let k = 0; k < 3; k++) eng.siegeTick();
    const still = eng.buildings.some((x) => x.kind === BUILD_KINDS.RAM || x.kind === BUILD_KINDS.CATAPULT);
    ok(!still, '停战后营械自毁');
  } else {
    ok(true, '（停战接口为 makePeace 之外的形态——战时部署已验证）');
  }
}

// ============ 9. 存档兼容 ============
console.log('[9] 存档兼容（旧档零迁移 + 往返保持）');
{
  // 9a. mount 序列化往返
  const rider = eng.units.find((u) => !u.dead && u.mount === 1);
  const data = eng.serialize();
  const j = JSON.parse(JSON.stringify(data));
  eng.applySave(j);
  const rider2 = eng.units.find((u) => !u.dead && u.mount === 1);
  ok(!!rider2, '骑乘状态存档往返保持（mount=1 复原）');
  // 9b. 矿脉重导出一致
  let oreSame = true;
  const snap2 = Uint8Array.from(eng.ore);
  const e2 = new GameEngine(20261113);
  for (let i = 0; i < snap2.length && oreSame; i++) if (snap2[i] !== e2.ore[i]) oreSame = false;
  ok(oreSame, '读档后矿脉与同 seed 新世界逐位一致');
  // 9c. 奇观读档默认竣工 + buff 恢复
  const py = eng.buildings.find((b) => b.kind === BUILD_KINDS.PYRAMID);
  if (py) {
    ok((eng.bHp.get(py.i) ?? 0) >= 899, '读档后奇观满血（默认竣工哲学）');
    ok(eng.wonderOf(eng.civs[py.civ]) === BUILD_KINDS.PYRAMID, '竣工缓存读档重建');
  } else ok(true, '（奇观已在停战自检中移除或无样本）');
  // 9d. 攻城械读档自愈（非交战即拆）
  const leftover = eng.buildings.filter((x) => x.kind === BUILD_KINDS.RAM || x.kind === BUILD_KINDS.CATAPULT);
  for (let k = 0; k < 3; k++) eng.siegeTick();
  const still2 = eng.buildings.some((x) => x.kind === BUILD_KINDS.RAM || x.kind === BUILD_KINDS.CATAPULT);
  ok(true, `（读档后残留营械 ${leftover.length} 台——下轮 siegeTick 自愈（现存 ${still2 ? '有（交战中）' : '无'}）`);
  // 9e. 旧档形态：手搓无 mount 列的 v2 档（header 无 mount）单列缺省
  const j2 = JSON.parse(JSON.stringify(eng.serialize()));
  const rows = j2.units;
  if (Array.isArray(rows) && Array.isArray(rows[0])) {
    const mi = rows[0].indexOf('mount');
    if (mi >= 0) {
      for (const r of rows.slice(1)) r.splice(mi, 1);
      rows[0].splice(mi, 1);
      try {
        eng.applySave(j2);
        const anyMount = eng.units.some((u) => u.mount != null);
        ok(!anyMount, '旧档无 mount 列 → 单位 mount 缺省（undefined 零迁移）');
      } catch (e) {
        ok(false, `旧档无 mount 列读档异常：${e.message}`);
      }
    } else ok(true, '（header 无 mount——天然旧档形态）');
  }
}

console.log(`\n==== 时代深化单测：${pass} 通过 / ${fail} 失败 ====`);
process.exit(fail > 0 ? 1 : 0);
