/* #67 A/B 逐 tick 哈希追踪 —— 定位门控引入的首个分歧 tick
 * 用法：agent-browser eval "$(cat scripts/pwb-fp.js)" && agent-browser eval "$(cat scripts/p67-abtrace.js)"
 * 然后 window.__AB.run(onBool) → { hashes: [h@50,h@100,...], h1, ms }
 */
(() => {
  if (!window.__PWB) return { err: 'install pwb-fp.js first' };
  const g = (window.__AB = window.__AB || {});
  g.run = (gateOn, ticks = 1000, step = 50) => {
    window.__wbBatchCore.gateEnabled = !!gateOn;
    const st = window.__wb.store.getState();
    const e = window.__wbEngine;
    const ok = st.loadFromSlot('slot2');
    if (!ok) return { error: 'load failed' };
    const hashes = [];
    for (let i = 1; i <= ticks; i++) {
      e.tick();
      if (i % step === 0) hashes.push(window.__PWB.simHash(e));
    }
    return { gateOn, hashes, h1: hashes[hashes.length - 1], units: e.units.length, tick: e.tickCount };
  };
  g.diff = (A, B) => {
    const out = [];
    for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) out.push({ ck: (i + 1) * 50, a: A[i], b: B[i] });
    return out;
  };
  return { ready: true, usage: '__AB.run(true) / __AB.run(false) / __AB.diff(A.hashes, B.hashes)' };
})();
