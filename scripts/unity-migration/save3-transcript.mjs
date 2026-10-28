// save3-transcript.mjs — M-U6c serialize 全档组装 JS 镜像（WbSave3.cs 的独立转写，非真实现！防循环论证双链）
// 复用 save2-transcript 的 ApplySave2/mkHost（M-U6b 已验证 181 断言语义）——状态袋产出同源
// 对账面：golden/save3.json 6 个 W3 场景 save 全档（deepSort 键序归一逐位）+ savedAt=0/source='manual' 协议
// 序敏感容器：镜像用 JS Map 原生插入序（entries()）；C# 用 data 输入行序重演 —— 殊途同归（恢复序=输入行序），
//   data 缺键/多键的边界差异由黄金对账暴露（双链互证）
// 跑法：node scripts/unity-migration/save3-transcript.mjs（全绿输出 M-U6c MIRROR PASS，退出码 0）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApplySave2, mkHost, unitsToRows2, jround, deepSort, isNum } from './save2-transcript.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/save3.json'), 'utf8'));

// ---------------- C# WbSave3 语义助手（同款转写） ----------------
const numOr = (v, d) => (isNum(v) ? (v !== 0 ? v : d) : d);   // JNumOr：非数/0 → d
const num0 = (v) => numOr(v, 0);
const jint = (v) => (isNum(v) ? Math.trunc(v) : 0);
const truthy = (t) => t !== null && t !== undefined && t !== false;
function b64Encode(bytes) { return Buffer.from(bytes).toString('base64'); }
// rleEncode（C# WbSave.RleEncode 转写：u16 小端 [v_lo, v_hi, run_lo, run_hi]，run<65535 截断）
function rleEncode(arr) {
  const pairs = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let run = 1;
    while (i + run < arr.length && arr[i + run] === v && run < 65535) run++;
    const uv = v & 0xff;
    pairs.push(uv, (v >> 8) & 0xff, run & 0xff, (run >> 8) & 0xff);
    i += run;
  }
  return b64Encode(pairs);
}
// owner Int16Array → u16 小端字节视图（蓝本 new Uint8Array(owner.buffer, ...)）
function ownerBytes(owner) {
  return new Uint8Array(owner.buffer, owner.byteOffset, owner.byteLength);
}

// 蓝本域常量（engine.ts L681 ctor cam）与 EVO_KINDS（L15538）
const ENG_W = 256, ENG_H = 160;
const EVO_KINDS = ['species', 'weapon', 'tech', 'trait', 'society'];

// WbSaveHost3 = mkHost（save2 lifted 查表）+ gen 端 hostNat 钩子（pcx/pcy/boundaryStress/hotspotsHost）
function mkHost3(scen) {
  const host = mkHost({});
  host.hookPlateCx = scen.hostNat.plateCx;
  host.hookPlateCy = scen.hostNat.plateCy;
  host.boundaryStress = scen.hostNat.boundaryStress;   // gen 端已升序（≡ nature.boundary Set 序）
  host.hotspotsHost = scen.hostNat.hotspotsHost;       // null = 恢复命中（状态袋自算）
  if (!host.ashCells) host.ashCells = 640;
  return host;
}

// ---------------- Serialize3（C# WbSave3.cs 语义独立转写） ----------------
function serialize3(st, host, data) {
  const o = {};
  // —— 标量组 ——
  o.v = 2;
  o.savedAt = 0;                       // 黄金协议剥离（蓝本 Date.now()）
  o.source = 'manual';                 // serialize('manual') 入参（黄金协议）
  o.seed = st.seed;
  o.tickCount = st.tickCount;
  o.yearF = st.yearF;
  o.unitSeq = st.unitSeq;
  o.civSeq = st.civSeq;
  o.toastSeq = st.toastSeq;
  o.victoryCiv = st.victoryCiv ?? null;
  o.multiCivSeen = st.multiCivSeen;
  // —— RLE 组（v2 不存 variant）——
  o.terrain = rleEncode(st.terrain);
  o.variant = '';
  o.owner = rleEncode(ownerBytes(st.owner));
  o.building = rleEncode(st.building);
  o.fire = rleEncode(st.fire);
  o.radiate = rleEncode(st.radiate);
  o.regrow = deepClone(st.regrow);
  o.radDue = deepClone(st.radDue);
  // —— 列式单位行（unitsToRows2 = WbSave2.UnitsToRows 镜像同源，含 header）——
  o.u = unitsToRows2(st.units);
  o.units = [];
  // —— 文明/建筑（JSON 层深克隆）——
  o.civs = deepClone(st.civs);
  o.buildings = deepClone(st.buildings);
  // —— rel（Map 插入序）/ met ——
  o.rel = [...st.rel.entries()];
  o.met = [...st.met];
  // —— cam（恢复命中 = 钳制值；未命中 = ctor 默认 {W/2, H/2, 4.5}）——
  o.cam = st.camApplied ? { x: st.cam.x, y: st.cam.y, zoom: st.cam.zoom } : { x: ENG_W / 2, y: ENG_H / 2, zoom: 4.5 };
  // —— 事件/法则/物品 ——
  o.events = deepClone(st.events);
  o.eventSeq = st.eventSeq;
  o.river = rleEncode(st.riverDir);
  o.road = rleEncode(st.road);
  o.laws = deepClone(st.laws);
  o.items = deepClone(st.items);
  o.itemSeq = st.itemSeq;
  // —— 触发器行化（triggerToRow L40-42）——
  o.triggers = st.triggers.map((t) => [t.id, t.name, JSON.stringify(t.cond), t.action, t.brush, t.x, t.y, t.r, t.enabled ? 1 : 0, t.once ? 1 : 0, t.fired, t.cd, t.nextFireYear]);
  o.triggerSeq = st.triggerSeq;
  // —— 军团方阵 ——
  o.armies = deepClone(st.armies);
  o.armySeq = st.armySeq;
  // —— 战争档案（values only；Map 插入序）——
  o.warData = [...st.warData.values()].map((w) => deepClone(w));
  // —— 动态战线 ——
  o.front = deepClone(st.occ);
  o.warShame = [...st.warShame.entries()];
  o.directives = deepClone(st.directives);
  o.dirSeq = st.dirSeq;
  // —— 物种进化棘轮基线 ——
  o.speciesBase = [...st.speciesBase.entries()].map(([race, b]) => [race, b.gene.s, b.gene.d, b.gene.h, b.gene.r, b.gen, b.sub ?? '', (b.beh ?? []).join(',')]);
  // —— 终极世界大战 + 停战表 ——
  o.worldWar = deepClone(st.worldWar);
  o.wwTruce = [...st.wwTruce.entries()];
  // —— 涌现层 dyn ——
  o.dyn = {
    races: [...st.dynRaces.entries()].map(([id, info]) => {
      const def = st.racesOut.get(id);
      const ecoN = info.eco === 'pred' ? 1 : info.eco === 'herb' ? 2 : info.eco === 'neutral' ? 3 : 0;
      const flags = (def?.isCiv ? 1 : 0) | (def?.hostile ? 2 : 0) | (def?.predator ? 4 : 0);
      const tintIdx = host.dynTints.indexOf(def?.dynTint ?? '');
      return [id, def?.name ?? `物种${id}`, info.parent, Math.round(def?.hp ?? 30), Math.round((def?.dmg ?? 5) * 10) / 10, Math.round((def?.speed ?? 0.06) * 1000) / 1000, Math.round((def?.repro ?? 0.002) * 10000) / 10000, tintIdx, def?.vis ? visToTuple3(def.vis) : null, info.parent2 ?? 0, ecoN, info.cap ?? 0, Math.round(def?.maxAge ?? 40), flags];
    }),
    weapons: [...st.emergentWeapons.values()].map((w) => deepClone(w)),
    dynSeq: st.dynSeq,
    weapSeq: st.weapSeq,
    dctr: [...st.doctrines.entries()].map(([id, d]) => [id, Math.round(d[0] * 100) / 100, Math.round(d[1] * 100) / 100, Math.round(d[2] * 100) / 100, Math.round(d[3] * 100) / 100]),
    ddef: [...st.defenses.entries()].map(([id, d]) => [id, Math.round(d[0]), Math.round(d[1]), Math.round(d[2])]),
    trts: [...st.dynTraits.entries()].map(([key, t]) => [key, t.name, Math.round((t.dmgMul ?? 1) * 100), Math.round((t.hpMul ?? 1) * 100), Math.round((t.speedMul ?? 1) * 100), Math.round((t.regen ?? 0) * 1000)]),
    traitSeq: st.traitSeq,
  };
  // —— v3 涌现科技/理念/进化图谱 ——
  o.emT = [...st.emTechs.entries()].map(([key, t]) => [t.key, t.name, host.techCats.findIndex((x) => x === t.cat), t.cost, t.gen, (t.effects ?? []).map((e) => `${e.k}:${e.v}`).join(',')]);
  o.emI = [...st.emIdeas.entries()].map(([key, i]) => [i.key, i.name, i.desc, Object.entries(i.mods ?? {}).map(([k, v]) => `${k}:${v}`).join(',')]);
  o.evo = st.evoNodes.map((n) => [n.id, EVO_KINDS.indexOf(n.kind), n.year, n.parent ?? -1, n.name, n.colorHex, n.detail, n.stat ?? '', n.alive ? 1 : 0, n.meta ? JSON.stringify(n.meta) : '']);
  o.evoSeq = st.evoSeq;
  // —— v39 家族谱系 ——
  o.fams = [...st.families.entries()].map(([id, f]) => [f.id, f.name, f.race, f.founded, f.founder, f.members, f.heroes, f.kills, f.peak, f.milestones]);
  o.familySeq = st.familySeq;
  // —— v40 神谕 Agent 法则 ——
  o.alws = deepClone(st.agentLaws);
  o.alwsSeq = st.alwsSeq;
  o.alwsCounters = deepClone(st.alwsCounters);
  // —— 自然引擎 ——
  o.nat = natRows3(st, host);
  // —— v4 联盟 + v5 造物工坊 ——
  o.als = st.alliances.map((al) => [al.id, al.name, al.members.join(','), al.leader, Math.round(al.cohesion), al.formedTick, al.formedYear, al.warsTogether, al.colorHex, al.bonded ? 1 : 0]);
  o.allianceSeq = st.allianceSeq;
  o.rrel = [...st.raceRel.entries()].map(([k, v]) => [k, Math.round(v)]);
  o.rmods = [...st.raceMods.entries()].filter(([rid]) => rid < 100);
  o.imods = [...st.itemMods.entries()];
  o.creg = [...st.creationRaceIds.entries()];
  return o;
}

function deepClone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
// unitsToRows3 = unitsToRows2（save2 镜像同源，含 42 列 header 行）
// UNIT_FIELDS 42 列（engine.ts L126 逐字——与 save2-transcript 同源）
const UNIT_FIELDS_3 = ['id', 'race', 'civ', 'x', 'y', 'tx', 'ty', 'hp', 'maxHp', 'dmg', 'speed', 'age', 'maxAge', 'kills', 'cd', 'trait', 'job', 'king', 'infected', 'flip', 'name', 'hurt', 'breath', 'parity', 'dead', 'boat', 'boatTTL', 'caravan', 'wep', 'arm', 'hlm', 'shd', 'bts', 'rng', 'amu', 'army', 'gene', 'food', 'fam', 'fgn', 'gIds', 'gVal'];
// visToTuple（emergence.ts 镜像同源——C# WbSave2.VisToTuple 消费）
function visToTuple3(v) {
  return [v.root, v.hue, jround(v.lum * 100), jround(v.size * 100), jround(v.bulk * 100), v.horns, v.spikes, v.mane, v.tail, v.ears, v.glow, v.pattern, v.crest];
}

// nat 全段（蓝本 L15282-15298）
function natRows3(st, host) {
  const nat = {};
  // stress：boundary 升序 ∩ stress>0.5 → [i, min(255, round(v*8))] slice(0,4096)
  const stressByI = new Map(st.nature.stress.map((r) => [r[0], r[1]]));
  const stressRows = [];
  for (const si of host.boundaryStress) {
    const v = stressByI.get(si);
    if (v === undefined || !(v > 0.5)) continue;
    stressRows.push([si, Math.min(255, Math.round(v * 8))]);
    if (stressRows.length >= 4096) break;
  }
  nat.stress = stressRows;
  // storms 行化
  nat.storms = st.nature.storms.map((s) => [s.id, Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, Math.round(s.strength * 100) / 100, s.ttl, s.seed, s.kind === 'blizzard' ? 1 : 0, (s.name ?? '').length, s.landed ? 1 : 0]);
  nat.ash = Math.round(st.nature.ash * 1000) / 1000;
  nat.seasonOffset = st.nature.seasonOffset;
  nat.counters = [...st.nature.counters];
  nat.stormSeq = st.nature.stormSeq;
  // pcx/pcy：宿主钩子真相（recomputePlates 后质心）
  nat.pcx = host.hookPlateCx.map((v) => Math.round(v * 10) / 10);
  nat.pcy = host.hookPlateCy.map((v) => Math.round(v * 10) / 10);
  nat.pe = st.nature.plateEpoch;
  // hot：宿主真相优先（hotspotsHost = 恢复未命中时 initPlates 真相；null = 恢复命中自算）
  if (host.hotspotsHost != null) {
    nat.hot = host.hotspotsHost.map((h) => [h[0], h[1], Math.round(h[2] * 100) / 100]);
  } else {
    nat.hot = st.nature.hotspots.map((h) => [h[0], h[1], Math.round(h[2] * 100) / 100]);   // ApplySave2 产出 [x,y,heat] 数组
  }
  // ashF：AshFFilled（旧档均匀播撒）→ ash>0.02 全场；稀疏 → 行展开扫描 >0.02
  const ashRows = [];
  if (st.nature.ashFFilled) {
    if (st.nature.ash > 0.02) for (let i = 0; i < host.ashCells; i++) ashRows.push([i, Math.round(st.nature.ash * 200)]);
  } else {
    const byCi = new Map(st.nature.ashF.map((r) => [r[0], r[1]]));
    for (let i = 0; i < host.ashCells; i++) {
      const v = byCi.get(i);
      if (v === undefined || !(v > 0.02)) continue;
      ashRows.push([i, Math.round(v * 200)]);
    }
  }
  nat.ashF = ashRows;
  return nat;
}

// ---------------- 逐位对账 ----------------
let pass = 0, fail = 0;
function cmp(label, a, b) {
  const ja = JSON.stringify(deepSort(a === undefined ? null : a));
  const jb = JSON.stringify(deepSort(b === undefined ? null : b));
  if (ja === jb) { pass++; return; }
  fail++;
  if (fail <= 8) {
    // 定位首个差异路径
    const path = diffPath(a, b);
    console.log(`[MIRROR FAIL] ${label} @ ${path}\n  mirror: ${ja.slice(0, 200)}\n  golden: ${jb.slice(0, 200)}`);
  }
}
function diffPath(a, b) {
  const sa = JSON.stringify(deepSort(a ?? null)), sb = JSON.stringify(deepSort(b ?? null));
  let i = 0;
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) i++;
  return `offset ${i}: …${sa.slice(Math.max(0, i - 30), i + 40)}… vs …${sb.slice(Math.max(0, i - 30), i + 40)}…`;
}

for (const scen of gold.scenarios) {
  const host = mkHost3(scen);
  let st = null, threw = null;
  try { st = ApplySave2(JSON.parse(JSON.stringify(scen.input)), host); } catch (e) { threw = String(e.message ?? e); }
  if (threw) { fail++; console.log(`[MIRROR FAIL] ${scen.name} 镜像重放抛错: ${threw}`); continue; }
  const out = serialize3(st, host, scen.input);
  cmp(`${scen.name}.save 全档`, out, scen.save);
}

console.log(`M-U6c 镜像逐位对账: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
console.log('M-U6c MIRROR PASS');
