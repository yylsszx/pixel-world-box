/* #67 战争风暴 20× 波动收口 —— 画像采样器（浏览器 eval 用，IIFE 自包含）
 * 用法：agent-browser eval "$(cat scripts/p67-warstorm.js)"
 * 之后按阶段调用 window.__P67.setup() / checkpoint() / profile('war'|'peace') / read() / startWar() / loadPeace()
 * 口径：500ms 采样 e.prof(snap/fire/buckets/units/effects/low) + e.uprof(pack2/batch/replay/wb/js) + bailKinds + tickMs/simUps
 */
(() => {
  const W = 256, H = 160;
  const e = window.__wbEngine;
  if (!e) return { err: 'no engine' };
  const g = (window.__P67 = window.__P67 || { samples: [], timer: 0, tag: '' });
  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 4 && y >= 4 && x < W - 4 && y < H - 4;
  const isLandT = (t) => t === 2 || t === 3 || t === 4 || t === 5; // SAND/GRASS/FOREST/HILL

  // 找「草地净地且周边野生动物稀少」的候选点
  g.findSpot = () => {
    let best = null, bestScore = 1e9;
    for (let a = 0; a < 220; a++) {
      const x = 8 + Math.floor(Math.random() * (W - 16));
      const y = 8 + Math.floor(Math.random() * (H - 16));
      const i = idx(x, y);
      if (e.terrain[i] !== 3 || e.building[i] !== 0 || e.owner[i] !== -1) continue;
      // 邻域净地密度 + 野生动物密度
      let grass = 0, wild = 0;
      for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
        const j = idx(x + dx, y + dy);
        if (e.terrain[j] === 3 && e.building[j] === 0) grass++;
      }
      for (const u of e.units) {
        if (u.dead || u.civ >= 0) continue;
        const d = Math.abs(u.x - x) + Math.abs(u.y - y);
        if (d < 14) wild++;
      }
      const score = wild * 10 + (49 - grass);
      if (score < bestScore) { bestScore = score; best = { x: x + 0.5, y: y + 0.5, wild, grass }; }
    }
    return best;
  };

  // Phase A：立两国 + 灌兵（400/国，6 成战士 4 成弓手）+ 20× 定居
  g.setup = (nPer = 400) => {
    e.speed = 0;
    const a = g.findSpot();
    if (!a) return { err: 'no spot A' };
    let b = null;
    for (let k = 0; k < 40 && !b; k++) {
      const c = g.findSpot();
      if (c && Math.abs(c.x - a.x) + Math.abs(c.y - a.y) >= 56) b = c;
    }
    if (!b) return { err: 'no spot B' };
    const uA = e.spawnUnit(0, a.x, a.y);
    const uB = e.spawnUnit(0, b.x, b.y);
    if (!uA || !uB) return { err: 'founding failed', uA: !!uA, uB: !!uB };
    // 确认两国（吸收圈 42 格会合并——距离已 ≥56 应为两国）
    const civIds = [];
    for (const c of e.civs) if (c && c.alive !== false && !civIds.includes(c.id)) civIds.push(c.id);
    const last2 = civIds.slice(-2);
    const capA = e.civs[last2[0]].capital, capB = e.civs[last2[1]].capital;
    const fill = (cap, civId) => {
      const cx = cap % W, cy = (cap / W) | 0;
      let n = 0, tries = 0;
      while (n < nPer && tries < nPer * 12) {
        tries++;
        const ang = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 12;
        const x = Math.max(2, Math.min(W - 3, cx + Math.cos(ang) * r));
        const y = Math.max(2, Math.min(H - 3, cy + Math.sin(ang) * r));
        const i = idx(x | 0, y | 0);
        if (!isLandT(e.terrain[i]) || e.building[i] !== 0) continue;
        const job = Math.random() < 0.6 ? 2 : 3; // 战士/弓手
        const nu = e.spawnUnit(0, x, y, { civ: civId, job, silent: true });
        if (nu) n++;
      }
      return n;
    };
    const nA = fill(capA, last2[0]);
    const nB = fill(capB, last2[1]);
    e.speed = 20; // 定居运转（建房/科技/编制）
    return {
      spotA: a, spotB: b, civA: last2[0], civB: last2[1],
      capA, capB, nA, nB, civs: e.civs.filter(c => c).length,
      unitsTotal: e.units.length, civUnits: e.units.filter(u => u.civ >= 0).length,
    };
  };

  // Phase B：存档检查点（宣战前）
  g.checkpoint = () => {
    const st = window.__wb.store.getState();
    st.saveToSlot('slot2');
    return { saved: 'slot2', tick: e.tickCount, units: e.units.length };
  };

  // Phase C/D：宣战 / 和平重载
  g.startWar = () => {
    const civIds = [];
    for (const c of e.civs) if (c && c.alive !== false) civIds.push(c.id);
    const [A, B] = civIds.slice(-2);
    const r = e.declareWar(A, B, 'annex', { force: true, total: true, quiet: true });
    e.speed = 20;
    return { war: !!r, A, B, armies: e.armies.length };
  };
  g.loadPeace = () => {
    const st = window.__wb.store.getState();
    st.loadFromSlot('slot2');
    e.speed = 20;
    return { tick: e.tickCount, units: e.units.length, armies: e.armies.length };
  };

  // Phase E：采样器（500ms 一次，EMA 直读）
  g.profile = (tag) => {
    clearInterval(g.timer);
    g.samples = [];
    g.tag = tag;
    const snap = () => {
      const P = e.prof, UP = e.uprof || {};
      g.samples.push({
        tag, t: Date.now(), tick: e.tickCount,
        units: e.units.length, armies: e.armies.length,
        tickMs: +e.tickMs.toFixed(2), simMs: +e.perf.simMs.toFixed(2), simUps: Math.round(e.perf.simUps),
        fps: Math.round(e.perf.fps),
        prof: { snap: +P.snap.toFixed(2), fire: +P.fire.toFixed(2), buckets: +P.buckets.toFixed(2), units: +P.units.toFixed(2), effects: +P.effects.toFixed(2), low: +P.low.toFixed(2) },
        uprof: { pack2: +(UP.pack2 || 0).toFixed(2), batch: +(UP.batch || 0).toFixed(2), replay: +(UP.replay || 0).toFixed(2), wb: +(UP.wb || 0).toFixed(2), js: +(UP.js || 0).toFixed(2) },
        bail: { ...e.bailKinds },
        stormTick: e._wbStormTicks ?? undefined,
      });
    };
    snap();
    g.timer = setInterval(snap, 500);
    return { profiling: tag };
  };

  g.read = () => {
    clearInterval(g.timer);
    const S = g.samples;
    const med = (arr) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[(a.length / 2) | 0] : -1; };
    const agg = (key, sub) => med(S.map(s => (sub ? s[key][sub] : s[key])));
    return {
      tag: g.tag, n: S.length,
      unitRange: S.length ? [Math.min(...S.map(s => s.units)), Math.max(...S.map(s => s.units))] : [],
      simMs: { med: agg('simMs'), max: S.length ? Math.max(...S.map(s => s.simMs)) : -1 },
      simUps: { med: agg('simUps'), max: S.length ? Math.max(...S.map(s => s.simUps)) : -1 },
      profMed: ['snap', 'fire', 'buckets', 'units', 'effects', 'low'].reduce((o, k) => (o[k] = agg('prof', k), o), {}),
      uprofMed: ['pack2', 'batch', 'replay', 'wb', 'js'].reduce((o, k) => (o[k] = agg('uprof', k), o), {}),
      bailTotal: S.length ? S[S.length - 1].bail : {},
      samples: S,
    };
  };

  return { ready: true, phases: ['setup', 'checkpoint', 'profile(tag)', 'startWar', 'loadPeace', 'read'] };
})();
