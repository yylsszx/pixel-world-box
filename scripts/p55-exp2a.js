// #55 实验二 A：重建 #54 受控世界（regenerate(777001) + 150 tick + saveToSlot('slot2')）
(function () {
  const e = window.__wbEngine;
  const st = window.__wb.store.getState();
  if (!e || !st) return 'TOOLING MISSING';
  e.speed = 0;
  e.regenerate(777001);
  for (let i = 0; i < 150; i++) e.tick();
  const ok = st.saveToSlot('slot2');
  const P = window.__PWB;
  return JSON.stringify({
    ok, seed: e.seed, n: e.units.length, tick: e.tickCount,
    mem: (function () {
      const WBB = window.__wbBatchCore;
      const b = new Uint8Array(WBB.ex.memory.buffer);
      let h = 2166136261 >>> 0;
      for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
      return ('0000000' + h.toString(16)).slice(-8);
    })(),
    h: P ? P.simHash(e) : null,
  });
})()
