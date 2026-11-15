#!/bin/bash
# #103 QA：现状取证——多 zoom 单位/建筑尺寸导出（定位「缩小地图时精灵太大」）
S=task-103
mkdir -p /tmp/qa103
cd /home/z/my-project/pixel-world-box
ab() { agent-browser --session $S "$@"; }

# 场景：中心岛草地 + 一组人形单位 + 房屋，多 zoom 导出
SETUP=$(ab eval "
(() => {
  const E = window.__wbEngine;
  if (!E) return 'NO-ENGINE';
  E.speed = 0;
  E.fxPrefs.dayNight = false;
  E.fxPrefs.dmgNumbers = false; E.fxPrefs.battleFlash = false; E.fxPrefs.hpBars = false;
  const W = 256, H = 160;
  const okT = (t) => t === 3 || t === 4 || t === 5 || t === 2;
  let x0 = -1, y0 = -1;
  outer: for (let cy = 8; cy < H - 14; cy++) {
    for (let cx = 8; cx < W - 34; cx++) {
      let ok = true;
      for (let y = cy; y < cy + 12 && ok; y++) for (let x = cx; x < cx + 34; x++) {
        if (!okT(E.terrain[y * W + x])) { ok = false; break; }
      }
      if (ok) { x0 = cx; y0 = cy; break outer; }
    }
  }
  if (x0 < 0) return 'NO-LAND';
  E.units.length = 0;
  // 建筑带
  for (let i = 0; i < 4; i++) {
    E.buildings.push({ x: x0 + 6 + i * 4, y: y0 + 2, kind: 'house', civ: -1, hp: 40, tier: 0, due: 0, burning: 0 });
  }
  // 人形单位两排 + 动物
  for (let i = 0; i < 8; i++) E.spawnUnit(x0 + 4 + i * 3, y0 + 6, 0);
  for (let i = 0; i < 4; i++) E.spawnUnit(x0 + 5 + i * 3, y0 + 8, 0);
  E.spawnUnit(x0 + 10, y0 + 10, 1); // sheep
  return 'OK x0=' + x0 + ' y0=' + y0;
})()" 2>/dev/null)
echo "setup: $SETUP"

CX=$(echo "$SETUP" | grep -oE 'x0=[0-9]+' | cut -d= -f2)
CY=$(echo "$SETUP" | grep -oE 'y0=[0-9]+' | cut -d= -f2)
CX=$((CX + 16)); CY=$((CY + 6))

export_view() { # $1=名字 $2=zoom
  RES=$(ab eval "
new Promise((resolve) => {
  const E = window.__wbEngine;
  E.zoomAnim = null;
  E.cam.zoom = $2;
  let n = 0;
  const step = () => {
    if (++n < 20) { requestAnimationFrame(step); return; }
    E.cam.x = $CX; E.cam.y = $CY;
    E.frameCount = 480;
    const step2 = () => {
      if (++n < 26) { requestAnimationFrame(step2); return; }
      const cv = document.querySelector('main canvas');
      const t = document.createElement('canvas');
      t.width = 640; t.height = 360;
      const g = t.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, (cv.width - 1280) / 2, (cv.height - 720) / 2, 1280, 720, 0, 0, 640, 360);
      resolve(t.toDataURL('image/png'));
    };
    requestAnimationFrame(step2);
  };
  requestAnimationFrame(step);
})" 2>/dev/null | tr -d '"\n')
  B64="${RES#data:image/png;base64,}"
  echo "$B64" | base64 -d > "/tmp/qa103/$1.png" 2>/dev/null
  echo "exported $1 (z$2, $(stat -c%s /tmp/qa103/$1.png 2>/dev/null) bytes)"
}

export_view z0.8 0.8
export_view z1.5 1.5
export_view z2.4 2.4
export_view z2.6 2.6
export_view z3.5 3.5
export_view z4.5 4.5
export_view z9.5 9.5
