// #66 hydra v2 无污染验证：清瞬态血迹/尸骸 → 干净地块 spawn → 冻结 → 采集待机/啮咬像素统计
(async () => {
  const e = window.__wbEngine;
  // 1) 清瞬态贴花（不入档——纯 QA 画面净化，血迹/尸骸老化本就会自然消退）
  const bloodCount = e.blood.length, corpseCount = e.corpses.length;
  e.blood.length = 0;
  e.corpses.length = 0;
  // 2) 找 14x14 纯草原无单位净地
  const terrain = e.terrain;
  const ok = (x0, y0) => {
    for (let y = y0; y < y0 + 14; y++) {
      for (let x = x0; x < x0 + 14; x++) {
        if (terrain[y * 256 + x] !== 3) return false; // #66 勘误：T.WATER=1/T.GRASS=3（初版写反曾把净地开成水塘）
      }
    }
    for (const u of e.units) {
      if (u.x >= x0 - 3 && u.x <= x0 + 17 && u.y >= y0 - 3 && u.y <= y0 + 17) return false;
    }
    return true;
  };
  let found = null;
  outer: for (let y = 6; y < 150; y += 1) {
    for (let x = 6; x < 242; x += 1) {
      if (ok(x, y)) { found = [x, y]; break outer; }
    }
  }
  if (!found) return JSON.stringify({ err: 'no patch', bloodCount, corpseCount });
  const [cx0, cy0] = found;
  const hx0 = cx0 + 7, hy0 = cy0 + 7;
  // 3) spawn + 冻结
  const h = e.spawnUnit(32, hx0, hy0);
  if (!h) return JSON.stringify({ err: 'spawn fail' });
  e.speed = 0;
  h.x = hx0; h.y = hy0; h.tx = hx0; h.ty = hy0; h.lx = undefined; h.ly = undefined;
  h.atk = 0; h.flip = false;
  e.zoomAnim = null; e.cam.zoom = 24; e.cam.x = hx0 + 0.5; e.cam.y = hy0 + 0.5;
  await new Promise(r => setTimeout(r, 400));
  // 4) 采集 hydra 精灵在 worldCanvas 上的像素足迹（18 宽 × 高度带）——验证三头分离（列剖面）
  const grab = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
    const wc = e.worldCanvas.getContext('2d');
    // 精绘档：世界画布上 hydra 占 18 设备像素宽；fx*4 为画布 x 起点（层B 2用户/格 × scale2）
    const px0 = Math.round(h.rx * 4) - 20, py0 = Math.round(h.ry * 4) + 4 - 20;
    const cols = [];
    for (let dx = 0; dx < 44; dx++) {
      let nonGrass = 0;
      for (let dy = 0; dy < 44; dy++) {
        const d = wc.getImageData(px0 + dx, py0 + dy, 1, 1).data;
        // 草原底色偏亮绿/黄绿：统计与「墨绿系」显著不同的深绿/红像素列
        if (d[3] > 0 && (d[0] < 90 || d[1] > 200 || (d[1] > d[0] + 30 && d[1] < 150))) nonGrass++;
      }
      cols.push(nonGrass);
    }
    res(cols);
  })));
  const idleCols = await grab();
  // 5) 啮咬态
  h.atk = 6;
  await new Promise(r => setTimeout(r, 120));
  const biteCols = await grab();
  return JSON.stringify({ bloodCount, corpseCount, patch: found, hydraId: h.id, idleCols, biteCols });
})();
