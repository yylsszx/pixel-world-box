#!/bin/bash
# #103 QA：M2 恢复合并后实机验收——半单位精灵多 zoom 导出 + 骑兵多坐骑 + 建筑比例
S=task-103b
mkdir -p /tmp/qa103b
cd /home/z/my-project/pixel-world-box
pkill -f "next dev" 2>/dev/null; sleep 1
npm run dev > /tmp/dev.log 2>&1 &
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
ab() { agent-browser --session $S "$@"; }
ab open http://localhost:3000 > /dev/null 2>&1
sleep 5
BTN=""
for i in $(seq 1 40); do
  BTN=$(ab snapshot -i 2>/dev/null | grep "进入世界" | grep -oE 'e[0-9]+' | head -1)
  [ -n "$BTN" ] && break
  sleep 3
done
echo "btn=[$BTN]"
ab click "@$BTN" > /dev/null 2>&1
sleep 8

# 场景：七杰横排 + 五兽 + 4 房 + 四坐骑骑兵（马/狼/鹿/驼）
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
    for (let cx = 8; cx < W - 40; cx++) {
      let ok = true;
      for (let y = cy; y < cy + 12 && ok; y++) for (let x = cx; x < cx + 40; x++) {
        if (!okT(E.terrain[y * W + x])) { ok = false; break; }
      }
      if (ok) { x0 = cx; y0 = cy; break outer; }
    }
  }
  if (x0 < 0) return 'NO-LAND';
  E.units.length = 0;
  // 七杰
  for (let r = 0; r < 7; r++) E.spawnUnit(r === 6 ? 2 : (r === 5 ? 5 : r), x0 + 3 + r * 3, y0 + 6, {});
  // 五兽
  E.spawnUnit(7, x0 + 4, y0 + 9, {});   // sheep
  E.spawnUnit(8, x0 + 8, y0 + 9, {});   // wolf
  E.spawnUnit(9, x0 + 12, y0 + 9, {});  // bear
  E.spawnUnit(10, x0 + 16, y0 + 9, {}); // deer
  // 四坐骑骑兵（mount 1-4）
  for (let m = 1; m <= 4; m++) {
    const u = E.spawnUnit(0, x0 + 6 + m * 4, y0 + 2, {});
    if (u) { u.mount = m; u.speed = 0; }
  }
  // 房屋×4（带文明才有色——建一个临时文明色引用不到则 civ -1 也画）
  for (let i = 0; i < 4; i++) E.buildings.push({ x: x0 + 2 + i * 4, y: y0 - 2, kind: 'house', civ: -1, hp: 40, tier: 0, due: 0, burning: 0 });
  return 'OK x0=' + x0 + ' y0=' + y0 + ' units=' + E.units.length;
})()" 2>/dev/null)
echo "setup: $SETUP"
CX=$(echo "$SETUP" | grep -oE 'x0=[0-9]+' | cut -d= -f2)
CY=$(echo "$SETUP" | grep -oE 'y0=[0-9]+' | cut -d= -f2)
CX=$((CX + 18)); CY=$((CY + 5))

export_view() {
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
      t.width = $3; t.height = $4;
      const g = t.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, (cv.width - $3) / 2, (cv.height - $4) / 2, $3, $4, 0, 0, $3, $4);
      resolve(t.toDataURL('image/png'));
    };
    requestAnimationFrame(step2);
  };
  requestAnimationFrame(step);
})" 2>/dev/null | tr -d '"\n')
  B64="${RES#data:image/png;base64,}"
  echo "$B64" | base64 -d > "/tmp/qa103b/$1.png" 2>/dev/null
  echo "exported $1 (z$2, $(stat -c%s /tmp/qa103b/$1.png 2>/dev/null) bytes)"
}

export_view m-z2.6 2.6 640 360
export_view m-z4.5 4.5 640 360
export_view m-z9.5 9.5 640 360
export_view m-z16 16 800 450
