// #55 实验六：逐 tick JS rng 消费数 + effects/items 长度 + rngA 追踪
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
  // 幂等包装 e.rng 计数（保留原函数语义）
  if (!e.__rngWrapped) {
    const orig = e.rng;
    e.rng = function () { e.__rngCount = (e.__rngCount || 0) + 1; return orig.call(e); };
    e.__rngWrapped = true;
  }
  window.__p55trace4 = function (runId, ticks) {
    ticks = ticks || 30;
    const ok = st.loadFromSlot('slot2');
    e.speed = 0;
    e.__rngCount = 0;
    const tr = [];
    for (let t = 1; t <= ticks; t++) {
      const c0 = e.__rngCount;
      e.tick();
      tr.push({
        t, mem: memH(),
        fx: e.effects.length, it: e.items.length, itSeq: e.itemSeq,
        draws: e.__rngCount - c0, rngA: e.rngA >>> 0, n: e.units.length,
      });
    }
    localStorage.setItem('p55_t4_' + runId, JSON.stringify({ ok, tr }));
    return JSON.stringify({ runId, ok, first: tr.slice(0, 2), last: tr.slice(-2) });
  };
  return 'p55trace4 installed';
})()
