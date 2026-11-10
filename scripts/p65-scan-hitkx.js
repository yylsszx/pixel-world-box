/** #65 QA：hitKx 受击方向写入与渲染位移一致性扫描（IIFE 由调用方包裹） */
(() => {
  const e = window.__wbEngine;
  const samples = [];
  let dirOK = 0, dirBad = 0;
  for (const u of e.units) {
    if (u.dead) continue;
    if (u.hitKx !== undefined && u.hitKx !== 0 && u.hurt > 0) samples.push(u);
  }
  // hurt>14 后仰窗口内：渲染位移方向必须 === hitKx
  for (const u of samples) {
    if (u.hurt > 14 && !u.boat) {
      const base = (u.rx ?? u.x) * 2;
      const moved = (u.dpx ?? base) - base;
      if (Math.abs(moved) > 0.01) {
        if (Math.sign(moved) === u.hitKx) dirOK++;
        else dirBad++;
      }
    }
  }
  // flip 背向对照：hitKx 与「旧版 flip 背向方向」不一致的样本数（>0 = 方向修正实际生效）
  let corrected = 0;
  for (const u of samples) {
    const oldKx = u.flip ? 1 : -1;
    if (u.hitKx !== oldKx) corrected++;
  }
  const hurtDist = {};
  for (const u of samples) { const k = 'h' + u.hurt; hurtDist[k] = (hurtDist[k] || 0) + 1; }
  return {
    units: e.units.length,
    hitKxSamples: samples.length,
    dirOK,
    dirBad,
    correctedFromFlip: corrected,
    hurtDist,
    demo: samples.slice(0, 6).map(s => ({ hurt: s.hurt, hitKx: s.hitKx, flip: s.flip })),
  };
})()
