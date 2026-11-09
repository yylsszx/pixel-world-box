// #55 实验二 B：载入序 + 逐检查点 mem/哈希采样（#54 协议复刻 + 边界 sig 字段 diff）
(function () {
  const P = window.__PWB;
  const e = window.__wbEngine;
  const st = window.__wb.store.getState();
  const WBB = window.__wbBatchCore;
  if (!P || !e || !st || !WBB) return 'TOOLING MISSING';
  const memBytes = () => new Uint8Array(WBB.ex.memory.buffer);
  function memH() {
    const b = memBytes(); let h = 2166136261 >>> 0;
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  const CKPTS = [1, 2, 3, 5, 10, 30];
  function runLoad(idx) {
    const ok = st.loadFromSlot('slot2');
    e.speed = 0;
    const b = { mem: memH(), h: P.simHash(e), rngA: e.rngA, n: e.units.length, tick: e.tickCount, sig: P.sig(e) };
    const ck = [];
    let prev = 0;
    for (const c of CKPTS) {
      for (let i = prev; i < c; i++) e.tick();
      prev = c;
      ck.push({ t: c, mem: memH(), h: P.simHash(e), rngA: e.rngA, n: e.units.length });
    }
    return { idx, ok, b, ck };
  }
  window.__p55seq = function (runId, nLoads) {
    nLoads = nLoads || 3;
    const runs = [];
    for (let i = 0; i < nLoads; i++) runs.push(runLoad(i));
    localStorage.setItem('p55_seq_' + runId, JSON.stringify(runs));
    const sum = runs.map(r => ({ i: r.idx, b: r.b.mem, rngAb: r.b.rngA, ck: r.ck.map(c => c.t + ':' + c.mem) }));
    const d0 = [];
    if (runs.length >= 2) {
      const s0 = runs[0].b.sig, s1 = runs[1].b.sig;
      for (const k of Object.keys(s0)) if (s1[k] !== undefined && s0[k] !== s1[k]) d0.push(k);
    }
    return JSON.stringify({ runId, runs: sum, bSigDiff: d0 });
  };
  return 'p55seq installed';
})()
