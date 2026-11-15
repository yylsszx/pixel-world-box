#!/bin/bash
# #102 QA-b：WB 宣传图等效取景（z16/z24 干净块验证）+ 纯草地动物场
S=task-102b
mkdir -p /tmp/qa102
cd /home/z/my-project/pixel-world-box
pkill -f "next dev" 2>/dev/null
sleep 1
npm run dev > /tmp/dev.log 2>&1 &
for i in $(seq 1 60); do
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
ab click "@$BTN" > /dev/null 2>&1
sleep 8

export_view() {
  RES=$(ab eval "
new Promise((resolve) => {
  const E = window.__wbEngine;
  E.zoomAnim = null;
  E.cam.zoom = $2;
  let n = 0;
  const step = () => {
    if (++n < 20) { requestAnimationFrame(step); return; }
    E.cam.x = Math.round($3); E.cam.y = Math.round($4);
    E.frameCount = 480;
    const step2 = () => {
      if (++n < 26) { requestAnimationFrame(step2); return; }
      const cv = document.querySelector('main canvas');
      const sx = Math.floor((cv.width - $5) / 2), sy = Math.floor((cv.height - $6) / 2);
      const t = document.createElement('canvas');
      t.width = $5; t.height = $6;
      t.getContext('2d').drawImage(cv, sx, sy, $5, $6, 0, 0, $5, $6);
      resolve(t.toDataURL('image/png'));
    };
    requestAnimationFrame(step2);
  };
  requestAnimationFrame(step);
})" 2>/dev/null | tr -d '"\n')
  B64="${RES#data:image/png;base64,}"
  echo "$B64" | base64 -d > "/tmp/qa102/$1.png" 2>/dev/null
  echo "exported $1 (z$2, $(stat -c%s /tmp/qa102/$1.png 2>/dev/null) bytes)"
}

# 纯草地场景：只认草地(3)上的动物 + 人类行
SETUP=$(ab eval "
(() => {
  const E = window.__wbEngine;
  if (!E) return 'NO-ENGINE';
  E.speed = 0;
  E.fxPrefs.dayNight = false;
  E.fxPrefs.dmgNumbers = false; E.fxPrefs.battleFlash = false; E.fxPrefs.hpBars = false;
  const W = 256, H = 160;
  let x0 = -1, y0 = -1;
  outer: for (let cy = 10; cy < H - 14; cy++) {
    for (let cx = 10; cx < W - 30; cx++) {
      let ok = true;
      for (let y = cy; y < cy + 10 && ok; y++) for (let x = cx; x < cx + 28; x++) {
        const t = E.terrain[y * W + x];
        if (t === 0 || t === 1 || t === 6 || t === 7 || t === 8) { ok = false; break; } // 只避深水/山/雪/熔岩
      }
      if (ok) { x0 = cx; y0 = cy; break outer; }
    }
  }
  if (x0 < 0) return 'NO-LAND';
  for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 28; x++) E.setTerrain(y * W + x, 3); // 强制草平原
  E.units.length = 0;
  for (let i = 0; i < 5; i++) E.spawnUnit(6, x0 + 2 + i * 2, y0 + 3, { silent: true });   // 羊×5
  E.spawnUnit(7, x0 + 13, y0 + 3, { silent: true }); E.spawnUnit(7, x0 + 15, y0 + 4, { silent: true }); // 狼×2
  E.spawnUnit(8, x0 + 19, y0 + 4, { silent: true });                                       // 熊
  E.spawnUnit(10, x0 + 23, y0 + 3, { silent: true }); E.spawnUnit(10, x0 + 25, y0 + 4, { silent: true }); // 鹿×2
  [0, 1, 2, 3, 4, 19, 20].forEach((r, i) => { E.spawnUnit(r, x0 + 1 + i * 3, y0 + 8, { job: 0, silent: true }); });
  window.__qa102b = { x0, y0 };
  return 'OK x0=' + x0 + ' y0=' + y0 + ' units=' + E.units.length;
})()" 2>&1 | tail -1)
echo "setup: $SETUP"
sleep 2
CX=$(ab eval "Math.round(window.__qa102b.x0 + 13)" 2>/dev/null | tr -d '"\r\n')
CY=$(ab eval "Math.round(window.__qa102b.y0 + 6)" 2>/dev/null | tr -d '"\r\n')
echo "cam: ($CX,$CY)"
export_view grass-z95 9.5 "$CX" "$CY" 420 260
export_view grass-z16 16 "$CX" "$CY" 420 260
export_view grass-z24 24 "$CX" "$CY" 420 260
pkill -f "next dev"
echo DONE