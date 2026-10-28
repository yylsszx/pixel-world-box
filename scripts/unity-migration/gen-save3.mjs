// gen-save3.mjs — M-U6c serialize 全档组装黄金向量生成器（Job 2902286）
// 真实现 = src/lib/game/engine.ts GameEngine.applySave/serialize 直跑 —— 纪律②零同源复制
// 蓝本段：engine.ts serialize L15187-15340（M-U6b 已覆盖 UnitsToRows 写向首段；本轮 = 全档组装对账）
// 场景构造 = gen-save2 黄金 inputs 重放契约（M-U6b 定型：黄金内嵌原始输入档）+ 确定性变异：
//   W3-ashfill   ashF 缺失 + ash=0.5 → 恢复分支 else fill(ash) → serialize 扫全场 640 行 [i, round(ash*200)]
//   W3-wwended   worldWar phase='ended' 全字段注入（fallen/pop0/winner/endText）→ serialize 深拷贝语义
//   W3-nohot     nat.hot 缺失（pcx/pcy 命中）→ hotspots = initPlates 宿主域 → nat.hot = 宿主真相（hostNat.hotspotsHost 上提）
//   W3-stormbliz storms blizzard+landed 行 + stormSeq spread → serialize 行化 [id, round(x*10)/10, ..., name.length, landed]
//   W3-rmods     rmods rid≥100 filter 过滤 + imods/creg 多行 → serialize 行序保真
// dump 协议：{ name, save: deepSort(serialize('manual')), savedAt=0, hostNat: { plateCx, plateCy, boundaryStress, hotspotsHost? } }
//   hostNat.hotspotsHost = 恢复分支未命中时宿主 initPlates 真相（null = 命中，C# 从状态袋自算）
// 跑法：node scripts/unity-migration/gen-save3.mjs（jiti 转译，自带 sanity + det 子进程双跑 + [GEN PASS]）
//   ⚠️ det 双跑必须子进程隔离（applySave dyn 恢复写全局 RACES/TRAITS/CIV_RACES 注册表——M-U6a 教训）
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片（必须在 import engine 之前挂好；gen-save2 同款） ----------------
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return null;
    if (k === 'createImageData' || k === 'getImageData')
      return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    return typeof k === 'string' ? noop : undefined;
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ getContext: () => stubCtx, width: 0, height: 0, style: {} }),
  createElementNS: () => ({ getContext: () => stubCtx, style: {} }),
  addEventListener: noop,
};
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const types = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

const W = 256, H = 160, WH = W * H;

// 场景间 RACES 注册表隔离（M-U6a 教训重演：applySave dyn 重注册写模块级全局 RACES，
// 前一 leg 基底场景残留的 100/101/102 会误过后续 fix 基底场景的 creg 守卫 RACES[rid]）——
// 清理 ≥100 键（引擎初始表 0-40）→ 每场景等价单进程干净态（NUnit/C# 每场景新 host 同语义）
function cleanDynRaces() {
  for (const id of [...Object.keys(types.RACES).map(Number)]) if (id >= 100) delete types.RACES[id];
}

// ---------------- 工具 ----------------
function deepSort(o) {
  if (Array.isArray(o)) return o.map(deepSort);
  if (o && typeof o === 'object') {
    const out = {};
    for (const k of Object.keys(o).sort()) out[k] = deepSort(o[k]);
    return out;
  }
  return o;
}
// gen-save2 黄金 inputs 重放契约（M-U6b 定型）：W 基底输入从 save2.json 读，变异后喂真实现
function loadWInputs() {
  const gold2 = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/save2.json'), 'utf8'));
  const fix = JSON.parse(JSON.stringify(gold2.inputs['W-fixture']));
  const leg = JSON.parse(JSON.stringify(gold2.inputs['W-legacy']));
  delete fix.__expectPlateCx; delete fix.__expectPlateCy;
  delete leg.__expectPlateCx; delete leg.__expectPlateCy;
  return { fix, leg };
}

// ---------------- 场景执行：applySave → serialize → dump ----------------
function scenW3(name, saveData) {
  cleanDynRaces();
  const eng = new GameEngine(424242);
  eng.applySave(JSON.parse(JSON.stringify(saveData)));
  const save2 = JSON.parse(JSON.stringify(eng.serialize('manual')));
  save2.savedAt = 0; // Date.now() 非确定 —— 黄金协议剥离
  const nat = eng.nature;
  // 宿主钩子上提（serialize 读宿主 nature 域状态 —— C#/镜像零副本消费）
  const boundaryStress = [];
  for (const [i, q] of (saveData.nat && Array.isArray(saveData.nat.stress) ? saveData.nat.stress : [])) {
    if (typeof i === 'number' && i >= 0 && i < WH && nat.boundary && nat.boundary.has(i)) boundaryStress.push(i);
  }
  boundaryStress.sort((a, b) => a - b);
  // hotspots 恢复分支命中判定：输入有非空 hot 行 → 命中（C# 从状态袋自算 nat.hot）；未命中 → 宿主 initPlates 真相上提
  const hotHit = saveData.nat && Array.isArray(saveData.nat.hot) && saveData.nat.hot.length > 0;
  return {
    name,
    input: deepSort(JSON.parse(JSON.stringify(saveData))),   // 原始输入档（镜像/NUnit 行序重演契约）
    save: deepSort(save2),
    hostNat: {
      plateCx: [...nat.plateCx],
      plateCy: [...nat.plateCy],
      boundaryStress,
      hotspotsHost: hotHit ? null : nat.hotspots.map((h) => [h.x, h.y, h.heat]),
    },
  };
}

// ---------------- 场景变异构造 ----------------
function buildScenarios() {
  const { fix, leg } = loadWInputs();
  const out = [];

  // W3-ashfill：ashF 缺失 + ash=0.5（>0.02）→ 恢复 else 分支 fill(ash) → serialize 扫全场 640 行
  {
    const s = JSON.parse(JSON.stringify(fix));
    s.nat.ash = 0.5;
    delete s.nat.ashF;
    out.push(scenW3('W3-ashfill', s));
  }

  // W3-wwended：worldWar ended 全字段注入 → serialize {...ww, belligerents:[...], fallen:[{...}]} 深拷贝
  {
    const s = JSON.parse(JSON.stringify(leg));
    s.worldWar = {
      phase: 'ended', startTick: 10, startYear: 5, endTick: 100,
      belligerents: [0, 1], pop0: { '0': 50, '1': 40 }, kills: 7,
      fallen: [
        { id: 0, name: '王朝甲', race: 0, tick: 20, year: 2 },
        { id: 1, name: '王朝乙', race: 1, tick: 88, year: 9 },
      ],
      truces: 1, nukes: 2, lasers: 3, drones: 4, orbitals: 5, plasmas: 6, antimatters: 7, emerged: 8,
      winner: 0, endText: '大战落幕',
    };
    out.push(scenW3('W3-wwended', s));
  }

  // W3-nohot：nat.hot 缺失（pcx/pcy/stress/ashF 保留）→ hotspots = initPlates 宿主域
  {
    const s = JSON.parse(JSON.stringify(fix));
    delete s.nat.hot;
    out.push(scenW3('W3-nohot', s));
  }

  // W3-stormbliz：storms blizzard+landed 行 + stormSeq=3 spread → serialize 行化（含 halfUp 量化）
  {
    const s = JSON.parse(JSON.stringify(leg));
    s.nat.storms = [
      [9, 50.55, 60.66, 1.255, 33, 777, 1, 'x', 1],   // blizzard landed（x*10 半上 505.5→506）
      [2, 3.21, 4.98, 0.444, 0, 12, 0, 'y', 0],        // cyclone 未落地（strength round(44.4)/100=0.44）
      [1, 250.9, 5.0, 1.9, 5, 3, 0, 'z', 1],           // x 钳制 250.9→251.9?（钳 3..W-4=252）round(2509)/10=250.9 合法
    ];
    s.nat.stormSeq = 3;
    out.push(scenW3('W3-stormbliz', s));
  }

  // W3-rmods：rmods rid≥100 filter 过滤 + imods/creg 多行 → serialize 行序保真
  {
    const s = JSON.parse(JSON.stringify(fix));
    s.rmods = [[200, JSON.stringify({ name: '超长名' })], [3, JSON.stringify({ hp: 150 })], [7, JSON.stringify({ dmg: 33 })]];
    s.imods = [['sword1', JSON.stringify({ dmg: 9 })], ['short_bow', JSON.stringify({ rng: 5 })]]; // bow1 非真键（真键 short_bow，M-U6b 教训②同款）
    s.creg = [['uid-1', 100], ['uid-2', 101]];
    out.push(scenW3('W3-rmods', s));
  }

  // W3-stress：stress 完整量化链（boundary 过滤/q≤4 钳入/q≥255 钳顶/越界丢弃）→ serialize 重演 round(v*8) 链
  //   注入 i 必须取自「恢复后」boundary（pcx/pcy 命中触发 recomputePlates 重建——初始 initPlates 的 boundary ≠ 恢复后）
  {
    const probe = new GameEngine(424242);
    probe.applySave(JSON.parse(JSON.stringify(fix)));
    const bArr = [...probe.nature.boundary];
    const bSet = probe.nature.boundary;
    const inB = bArr.slice(0, 4);                    // boundary 前 4 元素（升序）
    let out1 = -1, out2 = -1;                        // 两个 ∉boundary 的索引
    for (let i = 0; i < WH && (out1 < 0 || out2 < 0); i++) { if (!bSet.has(i)) { if (out1 < 0) out1 = i; else if (out2 < 0) out2 = i; } }
    const s = JSON.parse(JSON.stringify(fix));
    s.nat.stress = [
      [inB[0], 12],    // boundary∈ q=12 → stress=1.5>0.5 → 12
      [inB[1], 4],     // boundary∈ q=4 → stress=0.5 不>0.5 → serialize 过滤（boundaryStress 上提含此行，C# 重演 >0.5）
      [inB[2], 255],   // q=255 → 255
      [inB[3], 300],   // q=300 → stress=37.5 → round(300)=300 → min(255,300)=255 钳顶
      [out1, 20],      // ∉boundary → serialize 丢弃（恢复写入但扫描不到）
      [inB[0] + 1, 5], // ⚠ 不保证 ∈boundary——改用第 5 个 boundary 元素
      [out2, 8],       // ∉boundary → 丢弃
      [1e9, 50],       // 越界 → applySave 守卫丢弃
    ];
    s.nat.stress[5] = [bArr[4], 5]; // q=5 → 0.625>0.5 → 5
    out.push(scenW3('W3-stress', s));
  }

  return out;
}

// ---------------- sanity 断言 ----------------
function sanity3(byName) {
  const A = (name, cond, msg) => ({ name, cond, msg });
  const asserts = [];
  const af = byName.get('W3-ashfill');
  asserts.push(A('W3-ashfill v=2', af.save.v === 2, `v=${af.save.v}`));
  asserts.push(A('W3-ashfill ashF 全场 640 行', Array.isArray(af.save.nat.ashF) && af.save.nat.ashF.length === 640, `n=${af.save.nat.ashF?.length}`));
  asserts.push(A('W3-ashfill ashF 值 round(0.5*200)=100', af.save.nat.ashF[0][1] === 100, `v=${af.save.nat.ashF[0]?.[1]}`));
  asserts.push(A('W3-ashfill ashF i 序升序', af.save.nat.ashF[639][0] === 639, `last=${af.save.nat.ashF[639]?.[0]}`));
  asserts.push(A('W3-ashfill hotspotsHost 上提（hot 输入存在 → null）', af.hostNat.hotspotsHost === null, JSON.stringify(af.hostNat.hotspotsHost)));
  const ww = byName.get('W3-wwended');
  asserts.push(A('W3-wwended phase=ended', ww.save.worldWar.phase === 'ended', ww.save.worldWar.phase));
  asserts.push(A('W3-wwended fallen 深拷贝 2 行', Array.isArray(ww.save.worldWar.fallen) && ww.save.worldWar.fallen.length === 2, `n=${ww.save.worldWar.fallen?.length}`));
  asserts.push(A('W3-wwended winner=0（null 不覆盖）', ww.save.worldWar.winner === 0, JSON.stringify(ww.save.worldWar.winner)));
  asserts.push(A('W3-wwended endText 逐字', ww.save.worldWar.endText === '大战落幕', ww.save.worldWar.endText));
  asserts.push(A('W3-wwended belligerents 数组', JSON.stringify(ww.save.worldWar.belligerents) === '[0,1]', JSON.stringify(ww.save.worldWar.belligerents)));
  const nh = byName.get('W3-nohot');
  asserts.push(A('W3-nohot nat.hot = 宿主 initPlates 真相（hostNat 上提）', JSON.stringify(nh.save.nat.hot) === JSON.stringify(nh.hostNat.hotspotsHost.map((h) => [h[0], h[1], Math.round(h[2] * 100) / 100])), `hot=${JSON.stringify(nh.save.nat.hot).slice(0, 80)}`));
  asserts.push(A('W3-nohot hotspotsHost 非空', Array.isArray(nh.hostNat.hotspotsHost) && nh.hostNat.hotspotsHost.length > 0, `n=${nh.hostNat.hotspotsHost?.length}`));
  asserts.push(A('W3-nohot pcx 长度=plateN', nh.save.nat.pcx.length === nh.hostNat.plateCx.length, `pcx=${nh.save.nat.pcx.length}`));
  const sb = byName.get('W3-stormbliz');
  asserts.push(A('W3-stormbliz storms 3 行', sb.save.nat.storms.length === 3, `n=${sb.save.nat.storms.length}`));
  asserts.push(A('W3-stormbliz x halfUp 50.55→50.6', sb.save.nat.storms[0][1] === 50.6, `x=${sb.save.nat.storms[0][1]}`));
  asserts.push(A('W3-stormbliz strength 1.255 浮点回弹→1.25（1.255=1.25499...*100=125.499→125）', sb.save.nat.storms[0][3] === 1.25, `s=${sb.save.nat.storms[0][3]}`));
  asserts.push(A('W3-stormbliz blizzard kindI=1', sb.save.nat.storms[0][6] === 1, `k=${sb.save.nat.storms[0][6]}`));
  asserts.push(A('W3-stormbliz name.length>0', sb.save.nat.storms[0][7] > 0, `n=${sb.save.nat.storms[0][7]}`));
  asserts.push(A('W3-stormbliz landed=1', sb.save.nat.storms[0][8] === 1, `l=${sb.save.nat.storms[0][8]}`));
  asserts.push(A('W3-stormbliz cyclone 未落地 landed=0', sb.save.nat.storms[1][8] === 0, `l=${sb.save.nat.storms[1][8]}`));
  const rm = byName.get('W3-rmods');
  asserts.push(A('W3-rmods rid≥100 过滤', rm.save.rmods.every(([rid]) => rid < 100), JSON.stringify(rm.save.rmods.map((r) => r[0]))));
  asserts.push(A('W3-rmods 有效行序保真 [3,7]', JSON.stringify(rm.save.rmods.map((r) => r[0])) === '[3,7]', JSON.stringify(rm.save.rmods.map((r) => r[0]))));
  asserts.push(A('W3-rmods imods 2 行序（无效键 bow1 语义改 short_bow 真键）', JSON.stringify(rm.save.imods.map((r) => r[0])) === '["sword1","short_bow"]', JSON.stringify(rm.save.imods.map((r) => r[0]))));
  asserts.push(A('W3-rmods creg 守卫（101 ∉ 干净注册表 → uid-2 丢弃）', JSON.stringify(rm.save.creg) === '[["uid-1",100]]', JSON.stringify(rm.save.creg)));
  asserts.push(A('W3-rmods u 42 列', rm.save.u[0].length === 42, `hdr=${rm.save.u[0].length}`));
  const stq = byName.get('W3-stress');
  {
    const rows = stq.save.nat.stress;
    const iSeq = rows.map((r) => r[0]);
    const vSeq = rows.map((r) => r[1]);
    asserts.push(A('W3-stress 行序=boundary 升序 4 行', iSeq.length === 4 && iSeq.every((v, i) => i === 0 || iSeq[i-1] < v), JSON.stringify(iSeq)));
    asserts.push(A('W3-stress 值链 [12,255,255,5]（q=4 过滤/钳顶 255/∉boundary 丢弃）', JSON.stringify(vSeq) === '[12,255,255,5]', JSON.stringify(vSeq)));
    asserts.push(A('W3-stress boundaryStress 上提含 q=4 行（值过滤是 C# 可计算面）', stq.hostNat.boundaryStress.length >= 5, JSON.stringify(stq.hostNat.boundaryStress)));
  }
  // round-trip 不动点抽查：regrow/radDue/rel/met 原样回出
  for (const [nm, key] of [['W3-ashfill', 'regrow'], ['W3-wwended', 'radDue'], ['W3-stormbliz', 'rel'], ['W3-rmods', 'met']]) {
    const s = byName.get(nm);
    asserts.push(A(`${nm} ${key} round-trip 非空`, Array.isArray(s.save[key]) && s.save[key].length > 0, `n=${s.save[key]?.length}`));
  }
  return asserts;
}

// ---------------- 主流程（det 子进程隔离） ----------------
const isDetChild = process.argv.includes('--det-child');
function jsonOf() {
  return JSON.stringify({ meta: { gen: 'gen-save3.mjs' }, scenarios: buildScenarios() });
}
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  if (isDetChild) {
    const outN = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '1';
    const { writeFileSync: wf } = await import('node:fs');
    wf(`/tmp/save3-det${outN}.json`, jsonOf());
    process.exit(0);
  }
  const { spawnSync } = await import('node:child_process');
  const self = path.resolve(process.argv[1]);
  const r1 = spawnSync(process.execPath, [self, '--det-child', '--out=1'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const r2 = spawnSync(process.execPath, [self, '--det-child', '--out=2'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r1.status !== 0 || r2.status !== 0) { console.log('[det] child fail', (r1.stderr || '').slice(-400), (r2.stderr || '').slice(-400)); process.exit(1); }
  const { readFileSync: rf } = await import('node:fs');
  const j1 = rf('/tmp/save3-det1.json', 'utf8'), j2 = rf('/tmp/save3-det2.json', 'utf8');
  const { createHash } = await import('node:crypto');
  const m1 = createHash('md5').update(j1).digest('hex');
  const m2 = createHash('md5').update(j2).digest('hex');
  const detOk = m1 === m2;
  console.log(`[det] md5=${m1} ${detOk ? '==' : '!='} ${m2}`);
  const run1 = JSON.parse(j1).scenarios;
  const byName = new Map(run1.map((s) => [s.name, s]));
  const asserts = sanity3(byName);
  let sFail = 0;
  for (const a of asserts) {
    if (!a.cond) { console.log(`[SANITY FAIL] ${a.name}: ${a.msg}`); sFail++; }
  }
  console.log(`[sanity] ${asserts.length - sFail}/${asserts.length} PASS`);
  const gold = {
    meta: {
      gen: 'gen-save3.mjs',
      slice: 'M-U6c serialize 全档组装',
      bluebook: 'engine.ts serialize L15187-15340 全档组装（M-U6b 已覆盖 UnitsToRows；triggerToRow L40-42）',
      W, H,
    },
    scenarios: run1,
  };
  mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
  mkdirSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden'), { recursive: true });
  const fp = path.join(ROOT, 'scripts/unity-migration/golden/save3.json');
  writeFileSync(fp, JSON.stringify(gold));
  writeFileSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/save3.json'), JSON.stringify(gold));
  console.log(`[gen] written ${fp} (${(JSON.stringify(gold).length / 1024).toFixed(1)}KB) scenarios=${run1.length}`);
  if (!detOk || sFail) { console.log(`[GEN FAIL] det=${detOk} sanity=${sFail}`); process.exit(1); }
  console.log('[GEN PASS]');
}
export { buildScenarios, scenW3 };
