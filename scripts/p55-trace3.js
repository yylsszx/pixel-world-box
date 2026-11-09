// #55 实验五：逐 tick bail/批统计增量追踪（定位 bail 是否与分歧 tick 对齐）
(function () {
  const e = window.__wbEngine;
  const st = window.__wb.store.getState();
  const WBB = window.__wbBatchCore;
  if (!e || !st || !WBB) return 'TOOLING MISSING';
  const memBytes = () => new Uint8Array(WBB.ex.memory.buffer);
  function memH() {
    const b = memBytes(); let h = 2166136261 >>> 0;
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  const KEYS = ['bails', 'batches', 'actions', 'fallbacks', 'litePacks', 'packs', 'metaHits', 'metaSkips'];
  const snapStats = () => { const o = {}; for (const k of KEYS) o[k] = WBB.stats[k] || 0; return o; };
  window.__p55trace3 = function (runId, ticks) {
    ticks = ticks || 30;
    const ok = st.loadFromSlot('slot2');
    e.speed = 0;
    const tr = [];
    let prev = snapStats();
    for (let t = 1; t <= ticks; t++) {
      e.tick();
      const s = snapStats();
      const d = {};
      for (const k of KEYS) d[k] = s[k] - prev[k];
      prev = s;
      tr.push({ t, mem: memH(), n: e.units.length, d });
    }
    localStorage.setItem('p55_t3_' + runId, JSON.stringify({ ok, tr }));
    const bailTicks = tr.filter(x => x.d.bails > 0).map(x => x.t);
    return JSON.stringify({ runId, ok, bailTicks, lastMem: tr[tr.length - 1].mem, n: tr[tr.length - 1].n });
  };
  return 'p55trace3 installed';
})()
