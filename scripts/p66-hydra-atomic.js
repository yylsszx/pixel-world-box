// #66 hydra 终验原子布置：清贴花→净地→spawn→冻结→清特效→定镜头→立即返回（单 eval 内完成防漂移）
(async () => {
  const e = window.__wbEngine;
  const s = window.__wb.store.getState();
  // 冻结走 store 通道（React 会把 store 的速度状态同步回 engine——直设 engine.speed 会被覆盖）
  if (typeof s.setSpeed === 'function') s.setSpeed(0);
  e.speed = 0;
  e.blood.length = 0;
  e.corpses.length = 0;
  const terrain = e.terrain;
  const ok = (x0, y0) => {
    for (let y = y0; y < y0 + 10; y++) {
      for (let x = x0; x < x0 + 10; x++) {
        if (terrain[y * 256 + x] !== 3) return false; // #66 勘误：T.WATER=1/T.GRASS=3（初版写反曾把净地开成水塘）
      }
    }
    for (const u of e.units) {
      if (u.x >= x0 - 3 && u.x <= x0 + 17 && u.y >= y0 - 3 && u.y <= y0 + 17) return false;
    }
    return true;
  };
  let found = null;
  outer: for (let y = 4; y < 150; y++) {
    for (let x = 4; x < 242; x++) {
      if (ok(x, y)) { found = [x, y]; break outer; }
    }
  }
  if (!found) return JSON.stringify({ err: 'no patch' });
  const hx0 = found[0] + 5, hy0 = found[1] + 5;
  const h = e.spawnUnit(32, hx0, hy0);
  if (!h) return JSON.stringify({ err: 'spawn fail' });
  h.x = hx0; h.y = hy0; h.tx = hx0; h.ty = hy0; h.lx = undefined; h.ly = undefined;
  h.atk = 0; h.flip = false;
  // 清 spawn 烟雾特效（冻结态特效不再老化——上一课）
  e.effects = e.effects.filter(f => !(f.x >= hx0 - 3 && f.x <= hx0 + 3 && f.y >= hy0 - 3 && f.y <= hy0 + 3));
  e.zoomAnim = null; e.cam.zoom = 24; e.cam.x = hx0 + 0.5; e.cam.y = hy0 + 0.5;
  await new Promise(r => setTimeout(r, 500));
  return JSON.stringify({ patch: found, id: h.id, zoom: e.cam.zoom, speed: e.speed, tick: e.tickCount, storeSpeed: s.speed });
})();
