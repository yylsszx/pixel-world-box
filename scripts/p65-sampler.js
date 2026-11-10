/** #65 QA 采样器 v2：hurt>0 即记（归零解锁重记）；渲染方向验证对 hurt>14 窗口样本 */
(() => {
  const e = window.__wbEngine;
  if (window.__p65stop) clearInterval(window.__p65stop);
  const seen = new Set();
  window.__p65stats = { n: 0, dirOK: 0, dirBad: 0, corrected: 0, flipAgree: 0, noDpx: 0, winSamples: 0 };
  e.speed = 2;
  window.__p65stop = setInterval(() => {
    for (const u of e.units) {
      if (u.dead) { seen.delete(u.id); continue; }
      if (u.hitKx === undefined || u.hitKx === 0) continue;
      if (u.hurt <= 0) { seen.delete(u.id); continue; } // 归零解锁：下次受击可重记
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      const s = window.__p65stats;
      s.n++;
      const oldKx = u.flip ? 1 : -1;
      if (u.hitKx !== oldKx) s.corrected++; else s.flipAgree++;
      if (u.hurt > 14 && !u.boat) {
        s.winSamples++;
        const base = (u.rx ?? u.x) * 2;
        const moved = (u.dpx ?? base) - base;
        if (Math.abs(moved) > 0.01) {
          if (Math.sign(moved) === u.hitKx) s.dirOK++; else s.dirBad++;
        } else s.noDpx++;
      }
    }
    if (seen.size > 500) seen.clear();
  }, 30);
  return 'sampler v2 started (30ms, speed=2)';
})()
