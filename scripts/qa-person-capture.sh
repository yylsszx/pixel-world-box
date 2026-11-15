#!/bin/bash
# #100 QA 截图轮 v5：zoom 收敛→定相机→正午钉帧→画布导出（绕过截图管线的强制色彩缺陷）
S=task-03e363425671
mkdir -p /tmp/qa100
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
echo "btn=[$BTN]"
ab click "@$BTN" > /dev/null 2>&1
sleep 8

# 导出函数：zoom 收敛(20帧) → 定相机+正午钉帧 → 稳定(6帧) → 中心裁剪导出
export_view() { # $1=名字 $2=zoom $3=camx $4=camy $5=cw $6=ch
  RES=$(ab eval "
new Promise((resolve) => {
  const E = window.__wbEngine;
  E.zoomAnim = null; // 取消 zoom-to-cursor 动画（updateZoomAnim 每帧回写 cam.x/y 到旧锚点——直接设相机会被持续覆盖）
  E.cam.zoom = $2;
  let n = 0;
  const step = () => {
    if (++n < 20) { requestAnimationFrame(step); return; }
    E.cam.x = Math.round($3); E.cam.y = Math.round($4); // 整数相机：精灵落在整数设备像素（免亚像素混色）
    E.frameCount = 480;
    const step2 = () => {
      if (++n < 26) { requestAnimationFrame(step2); return; }
      const cv = document.querySelector('main canvas');
      const g = cv.getContext('2d');
      const sx = Math.floor((cv.width - $5) / 2), sy = Math.floor((cv.height - $6) / 2);
      const inView = E.units.filter((u) => Math.abs(u.x - E.cam.x) < 24 && Math.abs(u.y - E.cam.y) < 13).length;
      const d = g.getImageData(sx, sy, $5, $6).data;
      let sat = 0, tot = 0;
      for (let i = 0; i < d.length; i += 4) { tot++; if (Math.abs(d[i]-d[i+1]) > 12 || Math.abs(d[i+1]-d[i+2]) > 12) sat++; }
      const t = document.createElement('canvas');
      t.width = $5; t.height = $6;
      const tc = t.getContext('2d');
      tc.drawImage(cv, sx, sy, $5, $6, 0, 0, $5, $6);
      resolve(sat + '/' + tot + ' inv=' + inView + '|' + t.toDataURL('image/png'));
    };
    requestAnimationFrame(step2);
  };
  requestAnimationFrame(step);
})" 2>/dev/null | tr -d '"\n')
  VERDICT="${RES%%|*}"
  B64="${RES#*|}"
  B64="${B64#data:image/png;base64,}"
  echo "$B64" | base64 -d > "/tmp/qa100/$1.png" 2>/dev/null
  echo "exported $1 (z$2 sat $VERDICT, $(stat -c%s /tmp/qa100/$1.png 2>/dev/null) bytes)"
}

# 铺场：七杰（统一 civ:0/job:0——文明种族落地自动并入邻近王国并随机职务，王国袍色干扰种族识别）
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
  outer: for (let cy = 8; cy < H - 12; cy++) {
    for (let cx = 8; cx < W - 26; cx++) {
      let ok = true;
      for (let y = cy; y < cy + 10 && ok; y++) for (let x = cx; x < cx + 26; x++) {
        if (!okT(E.terrain[y * W + x])) { ok = false; break; }
      }
      if (ok) { x0 = cx; y0 = cy; break outer; }
    }
  }
  if (x0 < 0) return 'NO-LAND';
  E.units.length = 0;
  const races = [0, 1, 2, 3, 4, 19, 20];
  races.forEach((r, i) => { E.spawnUnit(r, x0 + 3 + i * 3, y0 + 7, { job: 0, silent: true }); });
  E.spawnUnit(0, x0 + 5, y0 + 3, { job: 0, trait: 'giant', silent: true });
  E.spawnUnit(0, x0 + 12, y0 + 3, { job: 0, trait: 'tiny', silent: true });
  E.spawnUnit(0, x0 + 20, y0 + 3, { job: 0, silent: true });
  window.__qa100 = { x0, y0 };
  return 'OK x0=' + x0 + ' y0=' + y0 + ' units=' + E.units.length;
})()" 2>&1 | tail -1)
echo "setup: $SETUP"
sleep 2
CX=$(ab eval "Math.round(window.__qa100.x0 + 13)" 2>/dev/null | tr -d '"\r\n')
CY=$(ab eval "Math.round(window.__qa100.y0 + 6)" 2>/dev/null | tr -d '"\r\n')
GX=$(ab eval "Math.round(window.__qa100.x0 + 10)" 2>/dev/null | tr -d '"\r\n')
GY=$(ab eval "Math.round(window.__qa100.y0 + 3.5)" 2>/dev/null | tr -d '"\r\n')
echo "cam: seven=($CX,$CY) giant=($GX,$GY)"

export_view seven-z45 4.5 "$CX" "$CY" 360 200
export_view seven-z75 7.5 "$CX" "$CY" 360 200
export_view giant-z75 7.5 "$GX" "$GY" 360 200
export_view zoom-2.4 2.4 "$CX" "$CY" 360 200
export_view zoom-2.6 2.6 "$CX" "$CY" 360 200
export_view zoom-7.9 7.9 "$CX" "$CY" 360 200
export_view zoom-8.1 8.1 "$CX" "$CY" 360 200

pkill -f "next dev"
echo "=== 特征色复验（命中特征色数/14）==="
for f in seven-z45 seven-z75 giant-z75 zoom-2.4 zoom-2.6 zoom-7.9 zoom-8.1; do
  N=$(node scripts/probe-person-pixels.mjs "/tmp/qa100/$f.png" 2>/dev/null | grep -c "✓" || true)
  echo "$f: $N/14"
done
