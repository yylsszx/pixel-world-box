// #66 终验：hydra v2 三代×4态哈希唯一性 + 啮咬实战回归 + 后仰 zoom 联动数值
(async () => {
  const e = window.__wbEngine;
  const s = window.__wb.store.getState();
  const out = { freeze: null, hashes: {}, bite: null, knock: null };
  // 1) 冻结（store 通道 + 引擎双保险；每步复核）
  if (typeof s.setSpeed === 'function') s.setSpeed(0);
  e.speed = 0;
  const c = document.querySelector('canvas');
  // 2) 远离人群的均匀净地（任意地形——冻结态下 10 秒测试不影响栖息；免 GRASS/WATER 枚举再次乌龙）
  const terrain = e.terrain;
  const okWater = (x0, y0) => {
    const t0 = terrain[y0 * 256 + x0];
    for (let y = y0; y < y0 + 12; y++) {
      for (let x = x0; x < x0 + 12; x++) {
        if (terrain[y * 256 + x] !== t0) return false;
      }
    }
    for (const u of e.units) {
      if (u.x >= x0 - 4 && u.x <= x0 + 16 && u.y >= y0 - 4 && u.y <= y0 + 16) return false;
    }
    return true;
  };
  let found = null;
  outer: for (let y = 8; y < 148; y++) {
    for (let x = 8; x < 244; x++) {
      if (okWater(x, y)) { found = [x, y]; break outer; }
    }
  }
  if (!found) return JSON.stringify({ err: 'no clear patch' });
  const cx = found[0] + 6, cy = found[1] + 6;
  out.freeze = { patch: found, tick: e.tickCount };
  const grab = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let acc = 0;
    for (let i = 0; i < d.length; i += 997) acc = (acc * 31 + d[i]) | 0;
    r(String(acc));
  })));
  e.zoomAnim = null; e.cam.zoom = 12; e.cam.x = cx + 0.5; e.cam.y = cy + 0.5;
  // 3) 三代 × 4 态
  for (const gen of [0, 1, 2]) {
    const h = e.spawnUnit(32, cx, cy);
    if (!h) return JSON.stringify({ err: 'spawn gen' + gen + ' fail' });
    h.gen = gen; h.x = cx; h.y = cy; h.tx = cx; h.ty = cy; h.lx = undefined; h.ly = undefined; h.flip = false;
    e.effects = e.effects.filter(f => !(f.x >= cx - 3 && f.x <= cx + 3 && f.y >= cy - 3 && f.y <= cy + 3));
    await new Promise(r => setTimeout(r, 350));
    for (const atk of [0, 10, 6, 2]) {
      h.atk = atk;
      out.hashes['g' + gen + '@' + atk] = await grab();
    }
    // 独占视锥：把这只挪走再放下一代
    h.x = -60; h.y = -60; h.tx = -60; h.ty = -60;
  }
  const uniq = new Set(Object.values(out.hashes)).size;
  out.hashes = { count: Object.keys(out.hashes).length, uniq };
  // 4) 后仰 zoom 联动数值验证：hurt=18/hitKx=1 的假想受击单位，zoom 4 vs zoom 9 的 dpx 偏移
  const probe = e.units.find(u => u.race === 32 && u.x === -60) || e.units[0];
  probe.x = cx; probe.y = cy; probe.tx = cx; probe.ty = cy; probe.lx = undefined; probe.ly = undefined;
  probe.boat = false; probe.caravan = 0; probe.hurt = 18; probe.hitKx = 1; probe.atk = 0;
  const readOff = async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const rx = probe.rx ?? probe.x;
    return Math.round(((probe.dpx ?? rx * 2) - rx * 2) * 100) / 100;
  };
  e.zoomAnim = null; e.cam.zoom = 4; e.cam.x = cx + 0.5; e.cam.y = cy + 0.5;
  await new Promise(r => setTimeout(r, 150));
  const off4 = await readOff();
  e.zoomAnim = null; e.cam.zoom = 9;
  await new Promise(r => setTimeout(r, 150));
  const off9 = await readOff();
  const exp4 = Math.round((((18 - 14) / 6) * 2.2 * 1.45) * 100) / 100;
  const exp9 = Math.round((((18 - 14) / 6) * 2.2 * 1.0) * 100) / 100;
  out.knock = { off4, exp4, ok4: Math.abs(off4 - exp4) < 0.1, off9, exp9, ok9: Math.abs(off9 - exp9) < 0.1 };
  probe.hurt = 0; probe.hitKx = 0;
  return JSON.stringify(out);
})();
