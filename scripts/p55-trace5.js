// #55 实验七：目标 tick 的 rng 调用栈直方图（定位多出的消费点）
(function () {
  const e = window.__wbEngine;
  const st = window.__wb.store.getState();
  const WBB = window.__wbBatchCore;
  if (!e || !st || !WBB) return 'TOOLING MISSING';
  if (!e.__rngWrapped5) {
    const orig = e.rng;
    e.__rngCapture = null;
    e.rng = function () {
      e.__rngCount = (e.__rngCount || 0) + 1;
      if (e.__rngCapture) {
        const s = new Error().stack || '';
        const lines = s.split('\n');
        const site = (lines[2] || '?').trim().replace(/^at /, '').replace(/ \(.*\)/, '') + ' < ' + (lines[3] || '?').trim().replace(/^at /, '').replace(/ \(.*\)/, '');
        e.__rngCapture.push(site);
      }
      return orig.call(e);
    };
    e.__rngWrapped5 = true;
  }
  window.__p55trace5 = function (runId, ticks, capTick) {
    ticks = ticks || 20; capTick = capTick || 19;
    const ok = st.loadFromSlot('slot2');
    e.speed = 0;
    e.__rngCount = 0;
    const per = [];
    for (let t = 1; t <= ticks; t++) {
      const c0 = e.__rngCount;
      e.__rngCapture = t === capTick ? [] : null;
      e.tick();
      const draws = e.__rngCount - c0;
      const cap = e.__rngCapture;
      e.__rngCapture = null;
      let hist = null;
      if (cap) {
        hist = {};
        for (const s of cap) hist[s] = (hist[s] || 0) + 1;
      }
      per.push({ t, draws, fx: e.effects.length, it: e.items.length, hist });
    }
    localStorage.setItem('p55_t5_' + runId, JSON.stringify({ ok, per }));
    const cap = per.find(x => x.t === capTick);
    return JSON.stringify({ runId, ok, capTick, capDraws: cap ? cap.draws : null, hist: cap ? cap.hist : null });
  };
  return 'p55trace5 installed';
})()
