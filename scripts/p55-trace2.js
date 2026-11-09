// #55 实验四：trace + 指定页字节捕获（base64 存 localStorage）
// 用法：agent-browser eval "window.__p55trace2('A',20,58,[19,20])"
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
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(s);
  }
  window.__p55trace2 = function (runId, ticks, page, capTicks) {
    const ok = st.loadFromSlot('slot2');
    e.speed = 0;
    const b = { mem: memH(), rngA: e.rngA, n: e.units.length, tick: e.tickCount };
    const tr = [];
    const caps = {};
    const capSet = new Set(capTicks || []);
    for (let t = 1; t <= ticks; t++) {
      e.tick();
      if (capSet.has(t)) caps['t' + t] = b64(memBytes().slice(page * 65536, (page + 1) * 65536));
      tr.push({ t, mem: memH(), n: e.units.length });
    }
    localStorage.setItem('p55_t2_' + runId, JSON.stringify({ ok, b, tr, caps }));
    return JSON.stringify({ runId, ok, b, last: tr.slice(-1) });
  };
  return 'p55trace2 installed';
})()
