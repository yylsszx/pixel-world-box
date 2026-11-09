// #55 实验三：逐 tick 追踪（mem+pages 全存），找首分歧 tick 与分歧页
// 用法：agent-browser eval "window.__p55trace('T1',30)" （先 eval 本文件安装）
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
  function pageHashes() {
    const b = memBytes(); const out = []; const PG = 65536;
    for (let p = 0; p * PG < b.length; p++) {
      let h = 2166136261 >>> 0; const s = p * PG, t = Math.min(s + PG, b.length);
      for (let i = s; i < t; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
      out.push(('0000000' + h.toString(16)).slice(-8));
    }
    return out;
  }
  window.__p55trace = function (runId, ticks) {
    ticks = ticks || 30;
    const ok = st.loadFromSlot('slot2');
    e.speed = 0;
    const b = { mem: memH(), h: P.simHash(e), rngA: e.rngA, n: e.units.length, tick: e.tickCount };
    const tr = [];
    for (let t = 1; t <= ticks; t++) {
      e.tick();
      tr.push({ t, mem: memH(), pages: pageHashes(), h: P.simHash(e), n: e.units.length });
    }
    localStorage.setItem('p55_tr_' + runId, JSON.stringify({ ok, b, tr }));
    return JSON.stringify({ runId, ok, b, first: tr.slice(0, 3).map(x => x.t + ':' + x.mem), last: tr.slice(-2).map(x => x.t + ':' + x.mem) });
  };
  return 'p55trace installed';
})()
