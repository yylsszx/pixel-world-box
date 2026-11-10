// #62 逐只隔离验证 v3：fresh spawn + 每只独占视锥 4 态（12 态全唯一目标）
(async () => {
  const e = window.__wbEngine;
  const T2 = e.spawnUnit(21, 40, 40), O2 = e.spawnUnit(22, 44, 41), H2 = e.spawnUnit(32, 48, 40);
  if (!T2 || !O2 || !H2) return JSON.stringify({ err: 'spawn失败', t: !!T2, o: !!O2, h: !!H2 });
  e.speed = 0;
  const canvas = document.querySelector('canvas');
  const w = canvas.width, h = canvas.height;
  const grab = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
    const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let acc = 0;
    for (let i = 0; i < d.length; i += 997) acc = (acc * 31 + d[i]) | 0;
    r(String(acc));
  })));
  e.zoomAt(44, 40, 10, w, h);
  await new Promise(r => setTimeout(r, 400));
  const out = {};
  for (const [name, u, others] of [['troll', T2, [O2, H2]], ['ogre', O2, [T2, H2]], ['hydra', H2, [T2, O2]]]) {
    for (const o2 of others) { o2.x = -60; o2.y = -60; }
    u.x = 40; u.y = 40; u.tx = 40; u.ty = 40; u.lx = undefined; u.ly = undefined;
    e.zoomAt(40, 40, 1.0, w, h);
    for (const atk of [0, 10, 6, 2]) {
      u.atk = atk;
      out[name + '@' + atk] = await grab();
    }
    for (const o2 of others) { o2.x = 44; o2.y = 41; }
  }
  e.speed = 1;
  const uniq = new Set(Object.values(out)).size;
  return JSON.stringify({ count: Object.keys(out).length, uniq, zoom: e.cam.zoom });
})()
