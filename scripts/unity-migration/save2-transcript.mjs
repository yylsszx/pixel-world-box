// save2-transcript.mjs — M-U6b 存档容器恢复全链 JS 镜像（WbSave2.cs 的独立转写，非真实现！防循环论证双链）
// 对账面：golden/save2.json R 组（恢复态 dump 逐位）+ X 组（抛错文案逐字）+ W 组（save.u 42 列逐位）
// 跑法：node scripts/unity-migration/save2-transcript.mjs（全绿输出 M-U6b MIRROR PASS，退出码 0）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/save2.json'), 'utf8'));
const L = gold.lifted; // 查表上提（C# WbSaveHost 同源）

// ---------------- JS 语义助手（转写 C# JNumOr/JInt/JRound/JClamp 语义） ----------------
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function numOr(v, d) { const n = typeof v === 'string' ? NaN : v; return isNum(n) ? n : d; } // Number(v)||d 的 JS 直写（JToken 域无字符串转换需求——gen 黄金均为 JSON 数）
const num0 = (v) => numOr(v, 0);
const jint = (v) => (isNum(v) ? Math.trunc(v) : 0); // x|0 域内
const jround = (v) => Math.floor(v + 0.5); // Math.round 半上（域内等价，M-U5a 已验证）
const jclamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function u32hex(v) { return '0x' + ((v >>> 0).toString(16).padStart(8, '0')); }
function deepSort(o) {
  if (Array.isArray(o)) return o.map(deepSort);
  if (o && typeof o === 'object') { const out = {}; for (const k of Object.keys(o).sort()) out[k] = deepSort(o[k]); return out; }
  return o;
}
const truthy = (v) => !(v === undefined || v === null || v === false || (typeof v === 'number' && isNaN(v)));

// mulberry32（WbRng.Mulberry32Next 转写——rngA u32 状态）
function rngNext(st) {
  st.rngA = (st.rngA + 0x6d2b79f5) | 0;
  let t = Math.imul(st.rngA ^ (st.rngA >>> 15), 1 | st.rngA);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------- B64/RLE 解码（M-U6a 已锁协议的复刻——镜像独立写） ----------------
function b64ToBytes(b64) {
  return Buffer.from(b64, 'base64');
}
function rleDecode(b64, expect) {
  const raw = b64ToBytes(b64);
  const aligned = [];
  for (let k = 0; k < Math.floor(raw.length / 2); k++) aligned.push(raw[k * 2] | (raw[k * 2 + 1] << 8));
  const out = new Uint8Array(expect);
  let pos = 0;
  for (let p = 0; p < aligned.length; p += 2) {
    const v = aligned[p], run = aligned[p + 1];
    if (run === 0) throw new Error('存档 RLE 数据损坏（零游程）');
    if (pos + run > expect) throw new Error('存档 RLE 数据损坏（游程超长）');
    out.fill(v, pos, pos + run);
    pos += run;
  }
  if (pos !== expect) throw new Error(`存档 RLE 长度不匹配: 期望 ${expect}, 实际 ${pos}`);
  return out;
}
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

// ---------------- ApplySave2（WbSave2.ApplySave 的 JS 转写） ----------------
const W = 256, H = 160, WH = W * H;
function ApplySave2(data, host) {
  const st = { // WbSaveState 镜像
    seed: 0, tickCount: 0, yearF: 0, unitSeq: 0, civSeq: 0, toastSeq: 0, victoryCiv: null, multiCivSeen: false,
    eventSeq: 0, itemSeq: 0, triggerSeq: 0, armySeq: 0, dirSeq: 0, evoSeq: 1, familySeq: 1, dynSeq: 100, weapSeq: 1,
    traitSeq: 1, allianceSeq: 1, emTechSeq: 1, ideaSeq: 1, rngA: 0,
    camApplied: false, cam: null,
    terrain: null, variant: null, owner: null, building: null, fire: null, radiate: null, riverDir: null, road: null,
    fireSet: [], frozen: [], riverTiles: [], occ: [], regrow: [], radDue: [],
    rel: new Map(), warShame: new Map(), raceRel: new Map(), wildCount: new Map(), allianceOf: new Map(), met: [],
    units: [], unitById: new Map(), droppedUnknown: 0, civs: [], buildings: [], bIdx: new Map(),
    events: [], zombieNoted: false, laws: {}, items: [], triggers: [],
    armies: [], warData: new Map(), directives: [], speciesBase: new Map(),
    emTechs: new Map(), emIdeas: new Map(),
    dynRaces: new Map(), racesOut: new Map(), civRaces: [...host.baseCivRaces], emergentWeapons: new Map(),
    doctrines: new Map(), defenses: new Map(), dynTraits: new Map(),
    evoNodes: [], evoIndex: new Map(), families: new Map(),
    agentLaws: [], alwsSeq: 1, alwsCounters: {},
    nature: { plateCx: null, plateCy: null, plateEpoch: 0, hotspots: [], stress: [], ash: 0, ashFFilled: false, ashF: [], seasonOffset: 0, counters: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], stormSeq: 1, storms: [], lastSeason: -1 },
    worldWar: null, wwTruce: new Map(), wwNuke: -600, wwAnti: -1200, wwFrenzy: -1,
    alliances: [], creationRaceIds: new Map(), raceMods: new Map(), itemMods: new Map(),
    raceOrigKeys: [], itemOrigKeys: [], raceThrived: [],
    lastClash: 0, lastReinforce: 0, lastVolley: 0,
  };
  const version = jint(data.v);
  if (version !== 1 && version !== 2) throw new Error(`不支持的存档版本: ${data.v === undefined ? 'undefined' : JSON.stringify(data.v) ?? 'null'}`);
  if (!Array.isArray(data.units) || !Array.isArray(data.civs) || !Array.isArray(data.buildings)) throw new Error('存档数据结构损坏');
  const isV2 = version === 2;
  const dec = (s, expect) => (isV2 ? rleDecode(s, expect) : b64ToBytes(s, expect));
  st.terrain = dec(data.terrain, WH);
  if (isV2) {
    st.variant = new Uint8Array(WH);
    const seed999 = jint(data.seed) + 999;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) st.variant[y * W + x] = Math.floor(hash2(x, y, seed999) * 255);
  } else {
    st.variant = dec(data.variant, WH);
  }
  const ownerBytes = dec(data.owner, WH * 2);
  st.owner = new Int16Array(WH);
  for (let i = 0; i < WH; i++) st.owner[i] = (ownerBytes[i * 2] | (ownerBytes[i * 2 + 1] << 8)) << 16 >> 16; // Int16 视图
  st.building = dec(data.building, WH);
  st.fire = dec(data.fire, WH);
  st.radiate = dec(data.radiate, WH);
  // 标量
  st.seed = jint(data.seed); st.tickCount = jint(data.tickCount); st.yearF = numOr(data.yearF, 0);
  st.unitSeq = jint(data.unitSeq); st.civSeq = jint(data.civSeq); st.toastSeq = jint(data.toastSeq);
  st.victoryCiv = data.victoryCiv ?? null; st.multiCivSeen = truthy(data.multiCivSeen);
  const cam = data.cam;
  if (cam && isNum(num0(cam.x)) && isNum(cam.x) && isNum(cam.y) && isNum(cam.zoom)) {
    st.camApplied = true;
    st.cam = { x: num0(cam.x), y: num0(cam.y), zoom: jclamp(num0(cam.zoom), 1.2, 24) };
  }
  st.rngA = (((st.seed ^ 0x9e3779b9) + st.tickCount) >>> 0) | 0; // ReseedRng（u32 存 int 位型）
  // emT/emI
  for (const row of data.emT ?? []) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const effects = String(row[5]).split(',').filter((s) => s.includes(':')).map((s) => { const [k, v] = s.split(':'); return { k, v: numOr(v, 0) }; });
    const catIdx = jint(row[2]);
    const ci = Math.max(0, Math.min(host.techCats.length - 1, catIdx));
    st.emTechs.set(String(row[0]), { key: String(row[0]), name: String(row[1]), cat: host.techCats[ci], cost: Math.max(10, numOr(row[3], 120)), gen: Math.max(1, numOr(row[4], 1)), effects, desc: '' });
    const g = typeof row[4] === 'number' && Number.isFinite(row[4]) ? row[4] + 1 : NaN;
    if (!Number.isNaN(g)) st.emTechSeq = Math.max(st.emTechSeq, g);
  }
  for (const row of data.emI ?? []) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const mods = {};
    for (const seg of String(row[3]).split(',')) {
      if (!seg.includes(':')) continue;
      const [k, v] = seg.split(':');
      const n = numOr(v, 0);
      if (k === 'gold' || k === 'mil' || k === 'know' || k === 'repro' || k === 'wear') mods[k] = n;
      else if (k === 'stab') mods.stab = jround(n);
    }
    st.emIdeas.set(String(row[0]), { key: String(row[0]), name: String(row[1]), desc: String(row[2]), mods });
    const iv = parseInt(String(row[0]).slice(2), 10);
    st.ideaSeq = Math.max(st.ideaSeq, (Number.isNaN(iv) ? 0 : iv + 1) || 1);
  }
  // 派生集合
  for (let i = 0; i < st.fire.length; i++) if (st.fire[i] > 0) st.fireSet.push(i);
  for (let i = 0; i < st.terrain.length; i++) if (st.terrain[i] === host.iceT) st.frozen.push(i);
  const river = data.river ? dec(data.river, WH) : new Uint8Array(WH);
  st.riverDir = river;
  for (let i = 0; i < river.length; i++) if (river[i] > 0 && host.waterT.includes(st.terrain[i])) st.riverTiles.push(i);
  st.road = data.road ? dec(data.road, WH) : new Uint8Array(WH);
  for (const [i, at] of data.regrow ?? []) st.regrow.push([jint(i), numOr(at, 0)]);
  for (const [i, at] of data.radDue ?? []) st.radDue.push([jint(i), numOr(at, 0)]);
  // 单位
  let savedUnits;
  if (isV2 && Array.isArray(data.u) && data.u.length > 1) {
    savedUnits = [];
    const header = data.u[0].map(String);
    for (let r = 1; r < data.u.length; r++) {
      const row = data.u[r];
      if (!Array.isArray(row) || row.length !== header.length) throw new Error('存档单位行损坏');
      const u = {};
      for (let c = 0; c < header.length; c++) { const v = row[c]; if (v !== null) u[header[c]] = v; }
      savedUnits.push(u);
    }
  } else {
    savedUnits = (data.units ?? []).map((u) => JSON.parse(JSON.stringify(u)));
  }
  for (const u of savedUnits) {
    if (typeof u.id !== 'number' || typeof u.race !== 'number') throw new Error('存档单位数据损坏');
    u.boat = u.boat ?? 0; u.boatTTL = u.boatTTL ?? 0;
    if (!host.races[String(jint(u.race))]) { st.droppedUnknown++; continue; }
    st.units.push(u);
  }
  for (const u of st.units) {
    if (typeof u.trk === 'string') {
      const d = host.itemDefs[u.trk];
      if (d && host.slotField[d.slot]) u[host.slotField[d.slot]] = u.trk;
      u.trk = null;
    }
    if (u.job == null) u.job = 0;
    st.unitById.set(jint(u.id), u);
  }
  for (const u of st.units) {
    if (truthy(u.dead)) continue;
    const rd = raceDefOf(st, host, jint(u.race));
    if (rd && truthy(rd.isCiv)) continue;
    st.wildCount.set(jint(u.race), (st.wildCount.get(jint(u.race)) ?? 0) + 1);
  }
  // 文明
  for (const c0 of data.civs) {
    const c = JSON.parse(JSON.stringify(c0));
    c.colonizeCd = c.colonizeCd ?? 0; c.history = c.history ?? [];
    c.gold = c.gold ?? 0; c.knowledge = c.knowledge ?? 0;
    c.techs = c.techs ?? []; c.research = c.research ?? null; c.researchP = c.researchP ?? 0;
    c.gov = c.gov ?? 0; c.govYear = c.govYear ?? 0; c.stability = c.stability ?? 70;
    c.culture = c.culture ?? 0; c.militarism = c.militarism ?? 30;
    c.income = c.income ?? 0; c.expense = c.expense ?? 0; c.festivalCd = c.festivalCd ?? 0;
    c.ideas = c.ideas ?? [];
    c.tiles = [...(c.tiles ?? [])]; c.frontier = [...(c.frontier ?? [])]; c.color = [...(c.color ?? [])];
    st.civs.push(c);
  }
  for (const c of st.civs) {
    if (c.research && !host.techKeys.includes(c.research) && !st.emTechs.has(c.research)) { c.research = null; c.researchP = 0; }
  }
  for (const b of data.buildings) st.buildings.push(JSON.parse(JSON.stringify(b)));
  st.buildings.forEach((b, i) => st.bIdx.set(jint(b.i), i));
  for (const [k, v] of data.rel ?? []) st.rel.set(k, numOr(v, 0));
  for (const k of data.met ?? []) st.met.push(k);
  for (const e of data.events ?? []) st.events.push(JSON.parse(JSON.stringify(e)));
  st.eventSeq = data.eventSeq ?? ((st.events[0]?.id ?? 0) + 1);
  st.zombieNoted = st.events.some((e) => e.kind === 'zombie') && (st.wildCount.get(host.zombieR) ?? 0) >= 20;
  st.laws = { ...JSON.parse(JSON.stringify(host.defaultLaws)), ...(data.laws ?? {}) };
  for (const row of data.items ?? []) st.items.push([row[0], row[1], row[2], row[3]]); // id/kind/x/y 全透传（L15487）
  st.itemSeq = data.itemSeq ?? (st.items.reduce((m, it) => Math.max(m, it.id), 0) + 1);
  for (const row of data.triggers ?? []) st.triggers.push(rowToTrigger(row, host));
  st.triggerSeq = data.triggerSeq ?? (st.triggers.reduce((m, t) => Math.max(m, jint(t.id)), 0) + 1);
  // 军团/战争/战线/旨意
  for (const a0 of data.armies ?? []) {
    const a = JSON.parse(JSON.stringify(a0));
    delete a.clashWith; delete a.battleSince;
    st.armies.push(a);
  }
  st.armySeq = data.armySeq ?? (st.armies.reduce((m, a) => Math.max(m, jint(a.id)), 0) + 1);
  for (const w of data.warData ?? []) {
    const key = w.key ?? pairKey(w.a ?? 0, w.b ?? 1);
    st.warData.set(key, normalizeWarInfo(w, st, host));
  }
  for (const [i, c, stv] of data.front ?? []) {
    const civAlive = c >= 0 && !!st.civs[c]?.alive;
    if (i < 0 || i >= WH || c < 0 || !civAlive) continue;
    st.occ.push([i, c, Math.max(1, Math.min(99, stv))]);
  }
  for (const [k, v] of data.warShame ?? []) st.warShame.set(k, numOr(v, 0));
  for (const d of data.directives ?? []) st.directives.push(JSON.parse(JSON.stringify(d)));
  st.dirSeq = data.dirSeq ?? (st.directives.reduce((m, d) => Math.max(m, jint(d.id)), 0) + 1);
  for (const row of data.speciesBase ?? []) {
    if (!Array.isArray(row) || row.length < 6) continue;
    st.speciesBase.set(jint(row[0]), {
      gene: { s: numOr(row[1], 1), d: numOr(row[2], 1), h: numOr(row[3], 1), r: numOr(row[4], 1) },
      gen: jint(row[5]), sub: row[6] || undefined, beh: row[7] ? String(row[7]).split(',').filter(Boolean) : undefined,
    });
  }
  // dyn 重注册
  st.dynRaces.clear(); st.emergentWeapons.clear(); st.doctrines.clear(); st.defenses.clear();
  for (const k of Object.keys(host.races)) st.racesOut.set(Number(k), JSON.parse(JSON.stringify(host.races[k])));
  const dynSave = data.dyn;
  if (isV2 && dynSave && typeof dynSave === 'object' && Array.isArray(dynSave.races)) {
    for (const row of dynSave.races) {
      if (!Array.isArray(row) || row.length < 8) continue;
      const [id, name, parent, hp, dmg, speed, repro, tintIdx, visT, parent2, ecoN, cap, maxAge, flags] = row;
      const pdef = raceDefOf(st, host, jint(parent));
      if (!pdef) continue;
      const vis = Array.isArray(visT) && visT.length >= 13 ? tupleToVis(visT) : visFromGene(pdef.vis?.root ?? parent, st);
      const merged = JSON.parse(JSON.stringify(pdef));
      merged.key = `dyn${id}`; merged.name = String(name);
      merged.dynTint = host.dynTints[Math.max(0, Math.min(7, jint(tintIdx)))];
      merged.vis = vis;
      merged.hp = Math.max(1, numOr(hp, num0(pdef.hp)));
      merged.dmg = numOr(dmg, num0(pdef.dmg));
      merged.speed = numOr(speed, num0(pdef.speed));
      merged.repro = numOr(repro, num0(pdef.repro));
      if (isNum(maxAge) && maxAge > 0) merged.maxAge = jround(maxAge);
      if (isNum(flags)) { merged.isCiv = !!(jint(flags) & 1); merged.hostile = !!(jint(flags) & 2); merged.predator = !!(jint(flags) & 4); }
      st.racesOut.set(jint(id), merged);
      const eco = ecoN === 1 ? 'pred' : ecoN === 2 ? 'herb' : ecoN === 3 ? 'neutral' : undefined;
      st.dynRaces.set(jint(id), { parent: jint(parent), bornYear: 0, parent2: parent2 && parent2 > 0 ? jint(parent2) : undefined, eco, cap: isNum(cap) && cap > 0 ? jround(cap) : undefined, uid: undefined });
      const isCiv = isNum(flags) ? !!(jint(flags) & 1) : !!truthy(pdef.isCiv);
      if (isCiv && !st.civRaces.includes(jint(id))) st.civRaces.push(jint(id));
    }
    for (const w of dynSave.weapons ?? []) {
      if (w && typeof w.id === 'number' && typeof w.name === 'string') st.emergentWeapons.set(w.id, JSON.parse(JSON.stringify(w)));
    }
    st.dynSeq = Math.max(100, dynSave.dynSeq ?? 100, ...[...st.dynRaces.keys()].map((x) => x + 1));
    st.weapSeq = Math.max(1, dynSave.weapSeq ?? 1, ...[...st.emergentWeapons.keys()].map((x) => x + 1));
    for (const row of dynSave.dctr ?? []) {
      if (!Array.isArray(row) || row.length < 5) continue;
      st.doctrines.set(jint(row[0]), [numOr(row[1], 0.2), numOr(row[2], 0.2), numOr(row[3], 0.2), numOr(row[4], 0.2)]);
    }
    for (const row of dynSave.ddef ?? []) {
      if (!Array.isArray(row) || row.length < 4) continue;
      st.defenses.set(jint(row[0]), [Math.max(0, numOr(row[1], 0)), Math.max(0, numOr(row[2], 0)), Math.max(0, numOr(row[3], 0))]);
    }
    for (const row of dynSave.trts ?? []) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const [key, name, dmg100, hp100, spd100, regen1000] = row;
      st.dynTraits.set(String(key), {
        key: String(key), name: String(name), desc: '涌现特质', good: true,
        dmgMul: dmg100 ? dmg100 / 100 : undefined, hpMul: hp100 ? hp100 / 100 : undefined,
        speedMul: spd100 ? spd100 / 100 : undefined, regen: regen1000 ? regen1000 / 1000 : undefined,
      });
    }
    st.traitSeq = Math.max(1, dynSave.traitSeq ?? 1, ...[...st.dynTraits.keys()].map((k) => parseInt(k.slice(2), 10) + 1 || 1));
  }
  // evo
  const EVO_KINDS = ['species', 'weapon', 'tech', 'trait', 'society'];
  for (const row of data.evo ?? []) {
    if (!Array.isArray(row) || row.length < 9) continue;
    let meta;
    if (row[9]) { try { meta = JSON.parse(String(row[9])); } catch { meta = undefined; } }
    st.evoNodes.push({ id: jint(row[0]), kind: EVO_KINDS[Math.max(0, Math.min(4, jint(row[1])))], name: String(row[4]), parent: (jint(row[3])) >= 0 ? jint(row[3]) : null, year: numOr(row[2], 0), colorHex: String(row[5]), detail: String(row[6]), stat: row[7] ? String(row[7]) : undefined, alive: row[8] === 1, meta });
  }
  st.evoSeq = Math.max(1, data.evoSeq ?? 1, ...st.evoNodes.map((n) => n.id + 1));
  for (const n of st.evoNodes) {
    if (n.kind === 'species' && n.meta?.race !== undefined) st.evoIndex.set(`sp:${num0(n.meta.race)}`, n.id);
    if (n.kind === 'weapon' && n.meta?.wid !== undefined) st.evoIndex.set(`wp:${num0(n.meta.wid)}`, n.id);
  }
  // fams
  for (const row of data.fams ?? []) {
    if (!Array.isArray(row) || row.length < 10) continue;
    st.families.set(jint(row[0]), { id: jint(row[0]), name: String(row[1]), race: jint(row[2]), founded: numOr(row[3], 0), founder: String(row[4]), members: jint(row[5]), heroes: jint(row[6]), kills: jint(row[7]), peak: jint(row[8]), milestones: jint(row[9]) });
  }
  st.familySeq = Math.max(1, data.familySeq ?? 1, ...[...st.families.keys()].map((id) => id + 1));
  // agentLaws
  if (Array.isArray(data.alws)) {
    for (const law of data.alws) {
      const n = normalizeLaw(law, host);
      if (n) st.agentLaws.push(n);
    }
    st.alwsSeq = Math.max(1, data.alwsSeq ?? 1);
  }
  st.alwsCounters = data.alwsCounters && typeof data.alwsCounters === 'object' ? { ...data.alwsCounters } : {};
  // 武器迁移
  for (const w of st.emergentWeapons.values()) {
    if (w.pl != null && w.pl >= 0) continue;
    const dtype = jclamp(numOr(w.dtype, 0), 0, 4);
    const delivery = jclamp(numOr(w.delivery, 0), 0, 4);
    w.pl = dtype === 0 ? 0 : dtype === 1 ? (num0(w.fire) > 0.4 ? 2 : 1) : dtype === 2 ? 3 : dtype === 3 ? 4 : 6;
    w.dl = delivery; w.gd = 2; w.pw = 0; w.q = [1, 1, 1, 1];
    w.inter = w.inter ?? 0;
  }
  // nature
  const natSave = data.nat;
  if (isV2 && natSave && typeof natSave === 'object') {
    const pcx = Array.isArray(natSave.pcx) ? natSave.pcx : null;
    const pcy = Array.isArray(natSave.pcy) ? natSave.pcy : null;
    if (pcx && pcy && pcx.length === host.plateN && pcy.length === host.plateN) {
      st.nature.plateCx = pcx.map((v) => jclamp(num0(v), 4, W - 4));
      st.nature.plateCy = pcy.map((v) => jclamp(num0(v), 4, H - 4));
      // 宿主事件 recomputePlates()（钩子后值不进对账面）
    }
    st.nature.plateEpoch = jint(natSave.pe);
    if (Array.isArray(natSave.hot) && natSave.hot.length > 0) {
      for (const hh of natSave.hot) {
        if (!Array.isArray(hh) || hh.length < 3) continue;
        st.nature.hotspots.push([jclamp(jint(hh[0]), 4, W - 5), jclamp(jint(hh[1]), 4, H - 5), jclamp(numOr(hh[2], 0), 0, 3)]);
      }
    }
    for (const [i, q] of Array.isArray(natSave.stress) ? natSave.stress : []) {
      if (isNum(i) && i >= 0 && i < WH) st.nature.stress.push([i, numOr(q, 0) / 8]);
    }
    st.nature.ash = jclamp(numOr(natSave.ash, 0), 0, 1);
    if (Array.isArray(natSave.ashF) && natSave.ashF.length > 0) {
      for (const [ci, q] of natSave.ashF) {
        if (isNum(ci) && ci >= 0 && ci < host.ashCells) st.nature.ashF.push([ci, jclamp(numOr(q, 0) / 200, 0, 1)]);
      }
    } else {
      st.nature.ashFFilled = true;
    }
    st.nature.seasonOffset = jint(natSave.seasonOffset);
    const cts = Array.isArray(natSave.counters) ? natSave.counters : [];
    if (cts.length >= 10) {
      st.nature.counters = [jint(cts[0]), jint(cts[1]), jint(cts[2]), jint(cts[3]), jint(cts[4]), jint(cts[5]), jint(cts[6]), jint(cts[7]), jint(cts[8]), jint(cts[9])];
    }
    // stormSeq spread 含全部行（len<9 损坏行也计入 id+1——L15690 先于恢复循环的独立表达式）
    let stormSeq = Math.max(1, (natSave.stormSeq ?? 1) | 0, ...(Array.isArray(natSave.storms) ? natSave.storms.map((s) => (s[0] | 0) + 1) : [1]));
    for (const row of Array.isArray(natSave.storms) ? natSave.storms : []) {
      if (!Array.isArray(row) || row.length < 9) continue;
      const [id, x, y, strength, ttl, seed, kindI, , landed] = row;
      st.nature.storms.push({ id: jint(id), x: jclamp(numOr(x, 4), 3, W - 4), y: jclamp(numOr(y, 4), 3, H - 4), strength: jclamp(numOr(strength, 0.4), 0.1, 1.6), ttl: Math.max(0, jint(ttl)), seed: jint(seed), kind: jint(kindI) === 1 ? 'blizzard' : 'cyclone', name: stormNameAt(jint(id), host), landed: !!landed });
    }
    st.nature.stormSeq = stormSeq;
  }
  // worldWar
  const wwSave = data.worldWar;
  if (wwSave && (wwSave.phase === 'running' || wwSave.phase === 'ended')) {
    st.worldWar = {
      phase: wwSave.phase,
      startTick: wwSave.startTick ?? 0, startYear: wwSave.startYear ?? 0, endTick: wwSave.endTick ?? 0,
      belligerents: Array.isArray(wwSave.belligerents) ? wwSave.belligerents.filter((v) => typeof v === 'number') : [],
      pop0: wwSave.pop0 ?? {},
      kills: wwSave.kills ?? 0,
      fallen: Array.isArray(wwSave.fallen) ? wwSave.fallen.filter((f) => f && typeof f.id === 'number') : [],
      truces: wwSave.truces ?? 0, nukes: wwSave.nukes ?? 0, lasers: wwSave.lasers ?? 0, drones: wwSave.drones ?? 0,
      orbitals: wwSave.orbitals ?? 0, plasmas: wwSave.plasmas ?? 0, antimatters: wwSave.antimatters ?? 0, emerged: wwSave.emerged ?? 0,
      winner: typeof wwSave.winner === 'number' ? wwSave.winner : null,
      endText: wwSave.endText ?? '',
    };
  } else {
    st.worldWar = { phase: 'idle', startTick: 0, startYear: 0, endTick: 0, belligerents: [], pop0: {}, kills: 0, fallen: [], truces: 0, nukes: 0, lasers: 0, drones: 0, orbitals: 0, plasmas: 0, antimatters: 0, emerged: 0, winner: null, endText: '' };
  }
  if (Array.isArray(data.wwTruce)) {
    for (const [k, v] of data.wwTruce) if (typeof k === 'string' && typeof v === 'number') st.wwTruce.set(k, v);
  }
  // 军团对账（倒序语义）
  for (let ai = st.armies.length - 1; ai >= 0; ai--) {
    const a = st.armies[ai];
    for (let k = a.members.length - 1; k >= 0; k--) {
      const u = st.unitById.get(a.members[k]);
      if (!u || u.dead || u.civ !== a.civ) a.members.splice(k, 1);
      else u.army = a.id;
    }
    if (a.members.length < 4) st.armies.splice(ai, 1);
  }
  // 联盟
  if (Array.isArray(data.als)) {
    for (const row of data.als) {
      if (!Array.isArray(row) || row.length < 9) continue;
      const [id, name, membersCsv, leader, cohesion, formedTick, formedYear, warsTogether, colorHex, bonded] = row;
      const members = String(membersCsv).split(',').map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0 && v < st.civs.length);
      if (members.length < 2) continue;
      const al = {
        id: jint(id), name: String(name || `同盟${id}`), members, leader: Math.max(0, jint(leader)),
        cohesion: jclamp(numOr(cohesion, 55), 0, 100), formedTick: jint(formedTick), formedYear: jint(formedYear),
        warsTogether: jint(warsTogether),
        colorHex: typeof colorHex === 'string' && colorHex.startsWith('#') ? colorHex : host.allianceColors[jint(id) % host.allianceColors.length],
        bonded: !!bonded,
      };
      st.alliances.push(al);
      for (const m of members) st.allianceOf.set(m, al.id);
      st.allianceSeq = Math.max(st.allianceSeq, jint(id) + 1);
    }
  }
  if (typeof data.allianceSeq === 'number') st.allianceSeq = Math.max(st.allianceSeq, data.allianceSeq | 0);
  if (Array.isArray(data.rrel)) {
    for (const [k, v] of data.rrel) if (typeof k === 'string' && typeof v === 'number') st.raceRel.set(k, jclamp(v, -80, 80));
  }
  // creg/rmods/imods
  if (Array.isArray(data.creg)) {
    for (const [uid, rid] of data.creg) {
      if (typeof uid === 'string' && typeof rid === 'number' && st.racesOut.has(rid)) {
        st.creationRaceIds.set(uid, rid);
        const info = st.dynRaces.get(rid);
        if (info) info.uid = uid;
      }
    }
  }
  if (Array.isArray(data.rmods)) {
    for (const [rid, json] of data.rmods) {
      if (typeof rid !== 'number' || rid < 0 || rid >= 100 || typeof json !== 'string') continue;
      const d = st.racesOut.get(rid);
      if (!d) continue;
      let p;
      try { p = JSON.parse(json); } catch { continue; }
      if (!st.raceOrigKeys.includes(rid)) st.raceOrigKeys.push(rid);
      if (typeof p.name === 'string' && p.name) d.name = p.name.slice(0, 8);
      if (typeof p.hp === 'number') d.hp = jclamp(jround(p.hp), 1, 99999);
      if (typeof p.dmg === 'number') d.dmg = jclamp(p.dmg, 0, 500);
      if (typeof p.speed === 'number') d.speed = jclamp(p.speed, 0.005, 0.3);
      if (typeof p.repro === 'number') d.repro = jclamp(p.repro, 0, 0.02);
      if (typeof p.maxAge === 'number') d.maxAge = jclamp(jround(p.maxAge), 1, 9999);
      if (typeof p.isCiv === 'boolean') d.isCiv = p.isCiv;
      if (typeof p.hostile === 'boolean') d.hostile = p.hostile;
      st.raceMods.set(rid, json);
    }
  }
  if (Array.isArray(data.imods)) {
    for (const [kind, json] of data.imods) {
      if (typeof kind !== 'string' || typeof json !== 'string') continue;
      const d = host.itemDefs[kind] ? JSON.parse(JSON.stringify(host.itemDefs[kind])) : null;
      if (!d) continue;
      // imods 补丁写 host.itemDefs 克隆挂到 state（镜像侧 itemDefsPatched）
      st.itemDefsPatched = st.itemDefsPatched ?? {};
      st.itemDefsPatched[kind] = d;
      let p;
      try { p = JSON.parse(json); } catch { continue; }
      if (!st.itemOrigKeys.includes(kind)) st.itemOrigKeys.push(kind);
      if (typeof p.name === 'string' && p.name) d.name = p.name.slice(0, 8);
      if (typeof p.rarity === 'number') d.rarity = jclamp(jround(p.rarity), 0, 4);
      if (typeof p.desc === 'string' && p.desc) d.desc = p.desc.slice(0, 40);
      for (const k of ['dmg', 'hp', 'speedMul', 'regen', 'armor', 'crit', 'lifesteal', 'thorns', 'ranged']) {
        const v = p[k];
        if (typeof v === 'number' && Number.isFinite(v)) d[k] = v;
      }
      st.itemMods.set(kind, json);
    }
  }
  // raceThrived（isCiv 读补丁后注册表）
  for (const u of st.units) {
    if (u.dead || !raceDefOf(st, host, u.race)?.isCiv) continue;
    if (!st.raceThrived.includes(u.race)) st.raceThrived.push(u.race);
  }
  // tDmg/tHp 科技基线（techMods 宿主查表）
  for (const u of st.units) {
    const tm = host.techMods.find((r) => r[0] === u.civ);
    if (u.civ >= 0 && st.civs[u.civ]?.alive && tm) { u.tDmg = tm[1]; u.tHp = tm[2]; }
    else { u.tDmg = 1; u.tHp = 1; }
  }
  return st;
}

function raceDefOf(st, host, race) {
  if (st.racesOut.has(race)) return st.racesOut.get(race);
  if (st.itemDefsPatched && false) return null; // noop
  return host.races[String(race)] ?? null;
}
function pairKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }
function stormNameAt(id, host) {
  const names = host.stormNames;
  return names[Math.min(names.length - 1, Math.max(0, id) % names.length)];
}
function tupleToVis(t) {
  return { root: jint(t[0]), hue: jint(t[1]), lum: num0(t[2]) / 100, size: num0(t[3]) / 100, bulk: num0(t[4]) / 100, horns: jint(t[5]), spikes: jint(t[6]), mane: jint(t[7]), tail: jint(t[8]), ears: jint(t[9]), glow: jint(t[10]), pattern: jint(t[11]), crest: jint(t[12]) };
}
function visFromGene(root, st) {
  const R = () => rngNext(st);
  const g = { s: 1, d: 1, h: 1, r: 1 };
  return {
    root,
    hue: jround((R() - 0.5) * 20 + (g.d - 1) * 14),
    lum: jround((0.92 + R() * 0.12 + (g.h - 1) * 0.08) * 100) / 100,
    size: jround((0.9 + R() * 0.2 + (g.h - 1) * 0.3) * 100) / 100,
    bulk: jclamp(0.3 + (g.h - 1) * 0.8 + (g.d - 1) * 0.3, 0, 1),
    horns: g.d > 1.25 ? (R() < 0.6 ? 1 : 2) : R() < 0.2 ? 1 : 0,
    spikes: g.d > 1.35 && R() < 0.5 ? 1 : 0,
    mane: g.h > 1.2 && R() < 0.4 ? 1 : 0,
    tail: jround(R() * 2),
    ears: R() < 0.45 ? 1 : R() < 0.5 ? 2 : 0,
    glow: R() < 0.12 ? 1 : 0,
    pattern: R() < 0.3 ? 1 : R() < 0.35 ? 2 : 0,
    crest: R() < 0.15 ? 1 : 0,
  };
}
function normalizeTrigger(o, host) {
  o = o ?? {};
  const kindRaw = o.kind === undefined ? '' : String(o.kind);
  let kind;
  if (kindRaw === 'cron' || kindRaw === 'event' || kindRaw === 'condition') kind = kindRaw;
  else if (kindRaw === '') kind = o.event !== undefined ? 'event' : o.cond !== undefined ? 'condition' : 'cron';
  else return `未知触发器类型 ${kindRaw}（可用：cron/event/condition）`;
  const chance = o.chance === undefined ? 1 : jclamp(isNum(o.chance) ? o.chance : 1, 0.01, 1);
  const season = o.season === undefined || o.season === null ? null : Math.max(0, Math.min(3, jround(numOr(o.season, 0))));
  const everyYears = o.everyYears === undefined ? (kind === 'condition' ? 1 : 10) : Math.max(1, Math.min(100, jround(numOr(o.everyYears, 1))));
  if (kind === 'event') {
    const ev = String(o.event ?? '');
    if (!host.eventKinds.includes(ev)) return `未知事件类型 ${ev}（可用 WorldEventKind，如 fall/war/plague/meteor/oracle…）`;
    const cd = o.eventCooldownYears === undefined ? 1 : Math.max(1, Math.min(100, jround(numOr(o.eventCooldownYears, 1))));
    return { kind: 'event', chance, event: ev, eventCooldownYears: cd };
  }
  if (kind === 'condition') {
    if (o.cond === undefined || o.cond === null) return 'condition 触发器必须带 cond 条件树';
    return { kind: 'condition', everyYears, chance, season, cond: JSON.parse(JSON.stringify(o.cond)) };
  }
  return { kind: 'cron', everyYears, chance, season };
}
function normalizeLaw(raw, host) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw;
  if (typeof o.id !== 'string' || !o.id) return null;
  if (!Array.isArray(o.actions)) return null;
  const actions = [];
  for (const a of o.actions) {
    if (a === null || typeof a !== 'object' || Array.isArray(a)) continue;
    if (!host.actionKinds.includes(String(a.kind ?? ''))) continue;
    actions.push(JSON.parse(JSON.stringify(a)));
  }
  if (actions.length === 0) return null;
  const tr = normalizeTrigger(o.trigger, host);
  const trigger = typeof tr === 'string' ? { kind: 'cron', everyYears: 10, chance: 1, season: null } : tr;
  const numOrL = (v, d) => (isNum(v) ? v : d);
  const name = typeof o.name === 'string' && o.name ? o.name.trim().slice(0, 24) : '无名法则';
  const desc = typeof o.desc === 'string' && o.desc ? o.desc.trim().slice(0, 120) : '（无描述）';
  return {
    id: o.id, name, desc,
    enabled: o.enabled !== false,
    createdYear: jround(numOrL(o.createdYear, 0)),
    durationYears: o.durationYears == null ? null : Math.max(1, Math.min(1000, jround(numOrL(o.durationYears, 100)))),
    trigger, actions,
    fired: Math.max(0, jround(numOrL(o.fired, 0))),
    lastYear: jround(numOrL(o.lastYear, 0)),
    revert: {},
  };
}
function rowToTrigger(row, host) {
  if (!Array.isArray(row) || row.length !== 13) throw new Error('存档触发器行损坏');
  let cond;
  try { cond = JSON.parse(row[2]); } catch { throw new Error('存档触发器条件损坏'); }
  if (!cond || typeof cond.kind !== 'string') throw new Error('存档触发器条件损坏');
  if (!host.toolIds.includes(row[3])) throw new Error(`存档触发器动作无效: ${row[3]}`);
  return { id: jint(row[0]), name: String(row[1]), cond, action: row[3], brush: jint(row[4]), x: jint(row[5]), y: jint(row[6]), r: jint(row[7]), enabled: !!row[8], once: !!row[9], fired: jint(row[10]), cd: jint(row[11]), nextFireYear: isNum(row[12]) ? row[12] : 0 };
}
function normalizeWarInfo(w, st, host) {
  const a = st.civs[w.a ?? -1], b = st.civs[w.b ?? -1];
  const reason = w.reason ?? (truthy(w.total) ? 'annex' : 'border');
  const goal = w.goal ?? 0;
  const bothAlive = a?.alive && b?.alive;
  let reasonText;
  if (w.reasonText ?? null) reasonText = w.reasonText;
  else if (bothAlive) {
    reasonText = '';
    for (const row of host.casusTable) {
      if (row[0] === (w.a ?? 0) && row[1] === (w.b ?? 1) && row[2] === reason && row[3] === goal) { reasonText = row[4]; break; }
    }
  } else reasonText = '';
  const aggressor = w.aggressor ?? (bothAlive ? (num0(a.pop) >= num0(b.pop) ? w.a : w.b) : (w.a ?? 0));
  return {
    key: w.key ?? pairKey(w.a ?? 0, w.b ?? 1),
    a: w.a ?? 0, b: w.b ?? 0,
    startTick: w.startTick ?? st.tickCount,
    startYear: w.startYear ?? Math.floor(st.yearF),
    total: w.total ?? false,
    scoreA: w.scoreA ?? 0, scoreB: w.scoreB ?? 0,
    exA: w.exA ?? 0, exB: w.exB ?? 0, casA: w.casA ?? 0, casB: w.casB ?? 0,
    razedA: w.razedA ?? 0, razedB: w.razedB ?? 0, battles: w.battles ?? 0,
    giveUpAt: w.giveUpAt ?? 0,
    reason, reasonText,
    aggressor, goal, goalNow: w.goalNow ?? 0, occA: w.occA ?? 0, occB: w.occB ?? 0,
    popA0: w.popA0 ?? a?.pop ?? 0, popB0: w.popB0 ?? b?.pop ?? 0,
    lastActiveTick: st.tickCount,
  };
}

// ---------------- dump 构建（转写 gen dumpState 布局——C# 态 → 黄金同构 dump） ----------------
const UNIT_FIELDS = gold.meta.unitFields;
function dumpState2(st, rawKeys, host) {
  const fire = [...st.fireSet].sort((a, b) => a - b);
  const frozen = [...st.frozen].sort((a, b) => a - b);
  const riverTiles = [...st.riverTiles].sort((a, b) => a - b);
  const occ = st.occ.slice().sort((a, b) => a[0] - b[0]);
  const ent = (m) => [...m.entries()].sort((a, b) => (typeof a[0] === 'string' ? (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) : a[0] - b[0]));
  const bytesHex = (arr) => Buffer.from(arr).toString('hex');
  const ownerBytes = new Uint8Array(st.owner.buffer, st.owner.byteOffset, st.owner.byteLength);
  const units41 = st.units.map((u) => UNIT_FIELDS.map((f) => (u[f] === undefined ? null : u[f])));
  const unitTth = st.units.map((u) => [f64hex(u.tDmg ?? 0), f64hex(u.tHp ?? 0)]);
  const techMods = st.civs.map((c) => {
    const tm = host.techMods.find((r) => r[0] === c.id);
    return [c.id, f64hex(tm ? tm[1] : 1), f64hex(tm ? tm[2] : 1)];
  });
  const dynIds = [...st.dynRaces.keys()].sort((a, b) => a - b);
  const dynRacesDump = dynIds.map((id) => {
    const d = st.racesOut.get(id);
    const info = st.dynRaces.get(id);
    return {
      id,
      def: d ? {
        key: d.key, name: d.name, hp: f64hex(d.hp), dmg: f64hex(d.dmg), speed: f64hex(d.speed), repro: f64hex(d.repro),
        maxAge: f64hex(d.maxAge), isCiv: !!d.isCiv, hostile: !!d.hostile, predator: !!d.predator,
        dynTint: d.dynTint ?? null, vis: d.vis ? visTupleOf(d.vis) : null,
      } : null,
      info: { parent: info.parent, parent2: info.parent2 ?? null, eco: info.eco ?? null, cap: info.cap ?? null, uid: info.uid ?? null },
    };
  });
  function visTupleOf(v) {
    return [v.root, v.hue, jround(v.lum * 100), jround(v.size * 100), jround(v.bulk * 100), v.horns, v.spikes, v.mane, v.tail, v.ears, v.glow, v.pattern, v.crest];
  }
  const weapons = [...st.emergentWeapons.values()].map((w) => deepSort({ ...w })).sort((a, b) => a.id - b.id);
  const evoNodes = st.evoNodes.map((n) => ({ id: n.id, kind: n.kind, name: n.name, parent: n.parent, year: n.year, colorHex: n.colorHex, detail: n.detail, stat: n.stat ?? null, alive: n.alive, meta: n.meta ?? null }));
  const stress = st.nature.stress.filter((r) => r[1] > 0).map((r) => [r[0], f64hex(r[1])]).sort((a, b) => a[0] - b[0]);
  const ashF = [];
  if (st.nature.ashFFilled) {
    for (let i = 0; i < host.ashCells; i++) if (st.nature.ash > 0) ashF.push([i, f64hex(st.nature.ash)]);
  } else {
    for (const [ci, q] of st.nature.ashF) if (q > 0) ashF.push([ci, f64hex(q)]);
    ashF.sort((a, b) => a[0] - b[0]);
  }
  const patchedBase = {};
  for (const id of st.raceOrigKeys) {
    const d = st.racesOut.get(id);
    if (d) patchedBase[id] = { name: d.name, hp: f64hex(d.hp), dmg: f64hex(d.dmg), speed: f64hex(d.speed), repro: f64hex(d.repro), maxAge: f64hex(d.maxAge), isCiv: !!d.isCiv, hostile: !!d.hostile };
  }
  const patchedItems = {};
  for (const kind of st.itemOrigKeys) {
    const d = st.itemDefsPatched?.[kind];
    if (d) patchedItems[kind] = deepSort(JSON.parse(JSON.stringify(d)));
  }
  const raw = rawKeys ? Object.fromEntries(rawKeys.map((k) => [k, bytesHex(k === 'owner' ? ownerBytes : k === 'river' ? st.riverDir : k === 'road' ? st.road : st.variant)])) : undefined;
  return {
    name: '',
    scalars: {
      seed: st.seed, tickCount: st.tickCount, yearF: f64hex(st.yearF),
      unitSeq: st.unitSeq, civSeq: st.civSeq, toastSeq: st.toastSeq,
      victoryCiv: st.victoryCiv ?? null, multiCivSeen: st.multiCivSeen,
      eventSeq: st.eventSeq, itemSeq: st.itemSeq, triggerSeq: st.triggerSeq,
      armySeq: st.armySeq, dirSeq: st.dirSeq, evoSeq: st.evoSeq,
      familySeq: st.familySeq, dynSeq: st.dynSeq, weapSeq: st.weapSeq,
      traitSeq: st.traitSeq, allianceSeq: st.allianceSeq,
      emTechSeq: st.emTechSeq, ideaSeq: st.ideaSeq,
      rngA: u32hex(st.rngA >>> 0),
    },
    cam: st.cam ? { x: f64hex(st.cam.x), y: f64hex(st.cam.y), zoom: f64hex(st.cam.zoom) } : null,
    raw,
    sets: { fire, frozen, riverTiles, occ },
    maps: {
      regrow: st.regrow.slice().sort((a, b) => a[0] - b[0]), radDue: st.radDue.slice().sort((a, b) => a[0] - b[0]),
      rel: ent(st.rel), warShame: ent(st.warShame), raceRel: ent(st.raceRel),
      wildCount: ent(st.wildCount), allianceOf: ent(st.allianceOf),
    },
    met: [...st.met].sort(),
    units41, unitTth, techMods,
    civs: st.civs.map((c) => ({
      id: c.id, name: c.name, race: c.race, color: [...c.color], colorHex: c.colorHex,
      pop: f64hex(c.pop), tiles: [...c.tiles], frontier: [...c.frontier],
      houses: c.houses, capital: c.capital, kingName: c.kingName, kingId: c.kingId ?? null,
      alive: c.alive, banner: c.banner, colonizeCd: c.colonizeCd == null ? null : f64hex(c.colonizeCd), popZeroTick: c.popZeroTick ?? null,
      history: (c.history ?? []).map((h) => [...h]),
      gold: f64hex(c.gold ?? 0), knowledge: f64hex(c.knowledge ?? 0), armyCd: f64hex(c.armyCd ?? 0),
      mobilizeUntil: c.mobilizeUntil == null ? null : f64hex(c.mobilizeUntil), mergedInto: c.mergedInto ?? null,
      techs: [...(c.techs ?? [])], research: c.research ?? null, researchP: f64hex(c.researchP ?? 0),
      gov: c.gov ?? 0, govYear: c.govYear ?? 0, stability: f64hex(c.stability ?? 70),
      culture: f64hex(c.culture ?? 0), militarism: f64hex(c.militarism ?? 30),
      income: f64hex(c.income ?? 0), expense: f64hex(c.expense ?? 0), festivalCd: f64hex(c.festivalCd ?? 0),
      ideas: [...(c.ideas ?? [])],
    })),
    buildings: st.buildings.map((b) => deepSort({ ...b })),
    bIdx: ent(st.bIdx),
    events: st.events.map((e) => deepSort({ ...e })),
    zombieNoted: st.zombieNoted,
    laws: deepSort({ ...st.laws }),
    items: st.items.map((it) => [it[0], it[1], it[2], it[3]]),
    triggers: st.triggers.map((t) => deepSort(JSON.parse(JSON.stringify(t)))),
    armies: st.armies.map((a) => deepSort(JSON.parse(JSON.stringify({ ...a })))).sort((a, b) => a.id - b.id),
    warData: [...st.warData.values()].map((w) => deepSort({ ...w })).sort((a, b) => (a.key < b.key ? -1 : 1)),
    directives: st.directives.map((d) => deepSort({ ...d })),
    speciesBase: [...st.speciesBase.entries()].sort((a, b) => a[0] - b[0]).map(([race, b]) => ({
      race, gene: { s: f64hex(b.gene.s), d: f64hex(b.gene.d), h: f64hex(b.gene.h), r: f64hex(b.gene.r) },
      gen: b.gen, sub: b.sub ?? null, beh: b.beh ?? null,
    })),
    dyn: { races: dynRacesDump, civRaces: [...st.civRaces], weapons, dynSeq: st.dynSeq, weapSeq: st.weapSeq,
      doctrines: [...st.doctrines.entries()].sort((a, b) => a[0] - b[0]).map(([id, d]) => [id, f64hex(d[0]), f64hex(d[1]), f64hex(d[2]), f64hex(d[3])]),
      defenses: [...st.defenses.entries()].sort((a, b) => a[0] - b[0]).map(([id, d]) => [id, f64hex(d[0]), f64hex(d[1]), f64hex(d[2])]),
      trts: [...st.dynTraits.values()].map((t) => deepSort(JSON.parse(JSON.stringify(t)))).sort((a, b) => (a.key < b.key ? -1 : 1)),
      traitSeq: st.traitSeq },
    evo: { nodes: evoNodes, index: ent(st.evoIndex), seq: st.evoSeq },
    fams: [...st.families.values()].sort((a, b) => a.id - b.id).map((f) => deepSort({ ...f })),
    familySeq: st.familySeq,
    panic: { peak: 0, events: 0, noteCd: 0 },
    alws: { laws: st.agentLaws.map((l) => deepSort(JSON.parse(JSON.stringify(l)))), counters: deepSort({ ...st.alwsCounters }), seq: st.alwsSeq },
    nat: {
      // plateCx/Cy = 宿主 recomputePlates 钩子后真相（C#/镜像为钳制面预写值）——对账豁免（expectPlate 单测于 NUnit）
      plateCx: null, plateCy: null, plateEpoch: st.nature.plateEpoch,
      hotspots: st.nature.hotspots.map((h) => [h[0], h[1], f64hex(h[2])]),
      stress, ash: f64hex(st.nature.ash), ashF, seasonOffset: st.nature.seasonOffset,
      counters: st.nature.counters, stormSeq: st.nature.stormSeq,
      storms: st.nature.storms.map((s) => ({ id: s.id, x: f64hex(s.x), y: f64hex(s.y), strength: f64hex(s.strength), ttl: s.ttl, seed: s.seed, kind: s.kind, name: s.name, landed: s.landed })),
      lastSeason: -1,
    },
    worldWar: deepSort(JSON.parse(JSON.stringify(st.worldWar))),
    wwTruce: ent(st.wwTruce),
    wwTimers: { nuke: -600, anti: -1200, frenzy: -1 },
    armiesTransient: { lastWarSet: 0, lastClash: 0, lastReinforce: 0, lastVolley: 0 },
    alliances: st.alliances.map((a) => deepSort(JSON.parse(JSON.stringify(a)))).sort((x, y) => x.id - y.id),
    workshop: { creg: ent(st.creationRaceIds), raceMods: ent(st.raceMods), itemMods: ent(st.itemMods), raceOrigKeys: [...st.raceOrigKeys].map(String).sort(), itemOrigKeys: [...st.itemOrigKeys].sort(), patchedBase, patchedItems },
    raceThrived: [...st.raceThrived].sort((a, b) => a - b),
    transient: { effects: 0, shake: 0, acc: 0, followId: null, selectedId: null },
  };
}

// ---------------- host 构建（黄金 lifted → 镜像 host；每场景 techMods/casusTable 注入） ----------------
function mkHost(scen) {
  return {
    races: L.races, itemDefs: L.itemDefs, slotField: L.slotField,
    toolIds: L.toolIds, techKeys: L.techKeys, techCats: L.techCats,
    actionKinds: L.actionKinds, eventKinds: L.eventKinds,
    dynTints: L.dynTints, allianceColors: L.allianceColors, stormNames: L.stormNames,
    baseCivRaces: L.baseCivRaces, waterT: L.waterT, iceT: L.iceT, zombieR: L.zombieR, ashCells: L.ashCells,
    defaultLaws: L.defaultLaws,
    casusTable: gold.casusTable,
    techMods: (scen.techMods ?? []).map((r) => [r[0], parseFloatHex(r[1]), parseFloatHex(r[2])]),
    plateN: 6, // R-legacy 宿主 seed 777 真值（gen 探测写入 expectPlateCx 长度）；其余场景不触板块恢复分支
  };
}
function parseFloatHex(hex) {
  const b = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return b.getFloat64(0, true);
}

// ---------------- 逐位对账 ----------------
let pass = 0, fail = 0;
function cmp(label, a, b) {
  const ja = JSON.stringify(deepSort(a === undefined ? null : a));
  const jb = JSON.stringify(deepSort(b === undefined ? null : b));
  if (ja === jb) { pass++; return; }
  fail++;
  if (fail <= 12) {
    const sa = ja.slice(0, 240), sb = jb.slice(0, 240);
    console.log(`[MIRROR FAIL] ${label}\n  mirror: ${sa}${ja.length > 240 ? '…' : ''}\n  golden: ${sb}${jb.length > 240 ? '…' : ''}`);
  }
}
function cmpRaw(label, a, b) {
  if (a === b) { pass++; return; }
  fail++;
  if (fail <= 12) console.log(`[MIRROR FAIL] ${label}\n  mirror: ${String(a).slice(0, 160)}\n  golden: ${String(b).slice(0, 160)}`);
}

// ---------------- 逐位对账主循环 ----------------
function unitsToRows2(units) {
  const rows = [[...UNIT_FIELDS]];
  for (const u of units) rows.push(UNIT_FIELDS.map((f) => (u[f] === undefined ? null : u[f])));
  return rows;
}

for (const scen of gold.scenarios) {
  const input = gold.inputs[scen.name];
  const host = mkHost(scen);
  if (scen.name.startsWith('R-')) {
    let st = null, threw = null;
    try { st = ApplySave2(JSON.parse(JSON.stringify(input)), host); } catch (e) { threw = String(e.message ?? e); }
    if (threw) { fail++; console.log(`[MIRROR FAIL] ${scen.name} 镜像重放抛错: ${threw}`); continue; }
    const rawKeys = scen.raw ? Object.keys(scen.raw) : null;
    const dump = dumpState2(st, rawKeys, host);
    dump.name = scen.name;
    const g = scen;
    cmp(`${scen.name}.scalars`, dump.scalars, g.scalars);
    // cam：输入档无有效 cam 时 golden 显示宿主默认 cam（引擎 ctor 域）——豁免
    const camInInput = input.cam && isNum(input.cam.x) && isNum(input.cam.y) && isNum(input.cam.zoom);
    if (camInInput) cmp(`${scen.name}.cam`, dump.cam, g.cam);
    cmp(`${scen.name}.sets`, dump.sets, g.sets);
    cmp(`${scen.name}.maps`, dump.maps, g.maps);
    cmp(`${scen.name}.met`, dump.met, g.met);
    cmp(`${scen.name}.units41`, dump.units41, g.units41);
    cmp(`${scen.name}.unitTth`, dump.unitTth, g.unitTth);
    cmp(`${scen.name}.techMods`, dump.techMods, g.techMods);
    cmp(`${scen.name}.civs`, dump.civs, g.civs);
    cmp(`${scen.name}.buildings`, dump.buildings, g.buildings);
    cmp(`${scen.name}.bIdx`, dump.bIdx, g.bIdx);
    cmp(`${scen.name}.events`, dump.events, g.events);
    cmp(`${scen.name}.zombieNoted`, dump.zombieNoted, g.zombieNoted);
    cmp(`${scen.name}.laws`, dump.laws, g.laws);
    cmp(`${scen.name}.items`, dump.items, g.items);
    cmp(`${scen.name}.triggers`, dump.triggers, g.triggers);
    cmp(`${scen.name}.armies`, dump.armies, g.armies);
    cmp(`${scen.name}.warData`, dump.warData, g.warData);
    cmp(`${scen.name}.directives`, dump.directives, g.directives);
    cmp(`${scen.name}.speciesBase`, dump.speciesBase, g.speciesBase);
    cmp(`${scen.name}.dyn`, dump.dyn, g.dyn);
    cmp(`${scen.name}.evo`, dump.evo, g.evo);
    cmp(`${scen.name}.fams+seq`, [dump.fams, dump.familySeq], [g.fams, g.familySeq]);
    cmp(`${scen.name}.panic`, dump.panic, g.panic);
    cmp(`${scen.name}.alws`, dump.alws, g.alws);
    // nat：plateCx/Cy 宿主钩子后真相 → 豁免；hotspots 在恢复分支未触发时为宿主 initPlates 域 → 豁免
    const natRestored = input.v === 2 && input.nat && typeof input.nat === 'object';
    const hotRestored = natRestored && Array.isArray(input.nat.hot) && input.nat.hot.length > 0;
    cmp(`${scen.name}.nat(豁免 plateCx/Cy${hotRestored ? '' : '+hotspots'})`,
      { ...dump.nat, plateCx: undefined, plateCy: undefined, hotspots: hotRestored ? dump.nat.hotspots : undefined },
      { ...g.nat, plateCx: undefined, plateCy: undefined, hotspots: hotRestored ? g.nat.hotspots : undefined });
    cmp(`${scen.name}.worldWar`, dump.worldWar, g.worldWar);
    cmp(`${scen.name}.wwTruce+timers`, [dump.wwTruce, dump.wwTimers], [g.wwTruce, g.wwTimers]);
    cmp(`${scen.name}.armiesTransient`, dump.armiesTransient, g.armiesTransient);
    cmp(`${scen.name}.alliances`, dump.alliances, g.alliances);
    cmp(`${scen.name}.workshop`, dump.workshop, g.workshop);
    cmp(`${scen.name}.raceThrived`, dump.raceThrived, g.raceThrived);
    cmp(`${scen.name}.transient`, dump.transient, g.transient);
    if (g.raw) for (const k of Object.keys(g.raw)) cmpRaw(`${scen.name}.raw.${k}`, dump.raw?.[k], g.raw[k]);
    else if (dump.raw !== undefined) { fail++; console.log(`[MIRROR FAIL] ${scen.name}.raw 镜像多产`); }
    // 板块钳制面预望（expectPlateCx 协议字段——C#/镜像可计算面）
    if (g.expectPlateCx) cmp(`${scen.name}.expectPlateCx/Cy`, [st.nature.plateCx, st.nature.plateCy], [g.expectPlateCx, g.expectPlateCy]);
  } else if (scen.name.startsWith('X-')) {
    let threw = null;
    try { ApplySave2(JSON.parse(JSON.stringify(input)), host); } catch (e) { threw = String(e.message ?? e); }
    cmp(`${scen.name}.threw`, threw, scen.threw);
  } else if (scen.name.startsWith('W-')) {
    let st = null, threw = null;
    try { st = ApplySave2(JSON.parse(JSON.stringify(input)), host); } catch (e) { threw = String(e.message ?? e); }
    if (threw) { fail++; console.log(`[MIRROR FAIL] ${scen.name} 镜像重放抛错: ${threw}`); continue; }
    cmp(`${scen.name}.save.u`, unitsToRows2(st.units), scen.save.u);
    cmp(`${scen.name}.save.civs.colonizeCd 固定点`, scen.save.civs.map((c) => c.colonizeCd), st.civs.map((c) => c.colonizeCd ?? 0));
  }
}

console.log(`M-U6b 镜像逐位对账: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
console.log('M-U6b MIRROR PASS');

