// QA：全绘档人形四相步态 —— 冻结 sim + 手动拨 frameCount，采中心 64×64 区域哈希
// 期望：周期 16 帧（h1000==h1016）+ 四相哈希两两不同 + 双单位同帧相位错开
(function () {
  var e = window.__wbEngine;
  if (!e) return 'NO_ENGINE';
  e.speed = 0;
  var u = null, u2 = null;
  var cands = [[128, 80], [120, 76], [136, 84], [110, 70], [140, 90], [100, 60], [150, 100]];
  for (var i = 0; i < cands.length; i++) {
    try {
      var r = e.spawnUnit(0, cands[i][0], cands[i][1]);
      if (r && r.x != null) { if (!u) u = r; else if (!u2) { u2 = r; break; } }
    } catch (err) {}
  }
  if (!u) return 'SPAWN_FAIL';
  u.lx = u.x - 1; u.ly = u.y;
  if (u2) { u2.lx = u2.x - 1; u2.ly = u2.y; }
  e.cam.zoom = 6; e.cam.x = u.x; e.cam.y = u.y;
  window.__QAU = u; window.__QAU2 = u2;
  window.__QAI = {
    h: function () {
      var cs = document.querySelectorAll('canvas'), c = cs[0];
      for (var i = 0; i < cs.length; i++) { if (cs[i].width * cs[i].height > c.width * c.height) c = cs[i]; }
      var w = c.width, hh = c.height;
      var t = document.createElement('canvas'); t.width = 64; t.height = 64;
      var tc = t.getContext('2d', { willReadFrequently: true });
      tc.drawImage(c, (w >> 1) - 32, (hh >> 1) - 32, 64, 64, 0, 0, 64, 64);
      var d = tc.getImageData(0, 0, 64, 64).data;
      var s = 0; for (var j = 0; j < d.length; j += 4) s = (s + d[j] * 31 + d[j + 1] * 17 + d[j + 2] * 3) | 0;
      return s;
    },
    h2: function () { // 第二单位：镜头拨到 u2 再采
      var e2 = window.__wbEngine, v2 = window.__QAU2;
      if (!v2) return -1;
      e2.cam.x = v2.x; e2.cam.y = v2.y;
      return this.h();
    }
  };
  return 'OK id=' + u.id + ' x=' + u.x + ' y=' + u.y + ' u2=' + (u2 ? u2.id : 'none');
})()
