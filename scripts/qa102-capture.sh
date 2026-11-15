#!/bin/bash
# #102 QA：半单位重定标实机验收——多 zoom 导出（含 9.5 统一档/2.4 色点档）+ A/B 像素扫描 + drawMs EMA
S=task-102-halfunit
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
echo "btn=[$BTN]"
ab click "@$BTN" > /dev/null 2>&1
sleep 8

export_view() { # $1=名字 $2=zoom $3=camx $4=camy $5=cw $6=ch
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
      const g = cv.getContext('2d');
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

# —— 场景铺设：七杰横排 + 五兽群 + 骷髅 + 森林带 + 建筑（房屋×4 + 箭塔）——
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
  // 森林带（右上角 6×3）
  for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) E.setTerrain((y0 + y) * W + (x0 + 27 + x), 4);
  // 七杰横排（自动入籍建档）
  [0, 1, 2, 3, 4, 19, 20].forEach((r, i) => { E.spawnUnit(r, x0 + 2 + i * 3, y0 + 10, { job: 0, silent: true }); });
  // 五兽 + 骷髅
  for (let i = 0; i < 6; i++) E.spawnUnit(6, x0 + 2 + i * 2, y0 + 4, { silent: true });      // 绵羊群
  E.spawnUnit(7, x0 + 15, y0 + 4, { silent: true }); E.spawnUnit(7, x0 + 17, y0 + 5, { silent: true }); // 狼
  E.spawnUnit(8, x0 + 20, y0 + 4, { silent: true });                                            // 熊
  for (let i = 0; i < 3; i++) E.spawnUnit(10, x0 + 24 + i * 2, y0 + 5, { silent: true });       // 鹿
  E.spawnUnit(16, x0 + 30, y0 + 9, { silent: true }); E.spawnUnit(16, x0 + 31, y0 + 11, { silent: true }); // 骷髅
  // 建筑：七杰入籍后取最近 civ
  const civ = E.civs.find((c) => c && c.alive);
  if (civ) {
    [0, 1, 2, 3].forEach((k) => { try { E.buildBuilding((y0 + 1) * W + (x0 + 10 + k * 3), 1, civ.id); } catch (e) {} });
    try { E.buildBuilding((y0 + 1) * W + (x0 + 23), 3, civ.id); } catch (e) {}
  }
  window.__qa102 = { x0, y0 };
  return 'OK x0=' + x0 + ' y0=' + y0 + ' units=' + E.units.length + ' civ=' + (civ ? civ.id : 'none') + ' blds=' + E.buildings.length;
})()" 2>&1 | tail -1)
echo "setup: $SETUP"
sleep 2
CX=$(ab eval "Math.round(window.__qa102.x0 + 16)" 2>/dev/null | tr -d '"\r\n')
CY=$(ab eval "Math.round(window.__qa102.y0 + 6)" 2>/dev/null | tr -d '"\r\n')
echo "cam: ($CX,$CY)"

export_view all-z45 4.5 "$CX" "$CY" 420 260
export_view all-z75 7.5 "$CX" "$CY" 420 260
export_view all-z95 9.5 "$CX" "$CY" 420 260
export_view all-z24 2.4 "$CX" "$CY" 420 260
export_view all-z26 2.6 "$CX" "$CY" 420 260

echo "=========== A/B 像素扫描（缓存开/关/开 三取逐位等价）==========="
ab eval "
new Promise((resolve) => {
  const E = window.__wbEngine;
  const cv = document.querySelector('main canvas');
  const g = cv.getContext('2d');
  Object.defineProperty(E, 'frameCount', { value: 1000, writable: false, configurable: true });
  const grab = () => {
    const t = document.createElement('canvas');
    t.width = cv.width; t.height = cv.height;
    t.getContext('2d').drawImage(cv, 0, 0);
    return t.toDataURL('image/png');
  };
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  (async () => {
    await raf(); const on1 = grab();
    window.__wbSPRC.off = true; await raf(); const off = grab();
    window.__wbSPRC.off = false; await raf(); const on2 = grab();
    resolve('on1_eq_off=' + (on1 === off) + ' on1_eq_on2=' + (on1 === on2));
  })();
})" 2>&1 | tail -1

echo "=========== drawMs EMA（缓存 ON→OFF→ON 各 2s）==========="
ab eval "
new Promise((resolve) => {
  const E = window.__wbEngine;
  E.speed = 1;
  const ema = () => new Promise((res) => {
    let acc = 0, n = 0;
    const t0 = performance.now();
    const tick = () => {
      acc += E.perf?.drawMs ?? 0; n++;
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
      else res(n ? (acc / n).toFixed(2) : '-1');
    };
    requestAnimationFrame(tick);
  });
  (async () => {
    const a = await ema();
    window.__wbSPRC.off = true; const b = await ema();
    window.__wbSPRC.off = false; const c = await ema();
    E.speed = 0;
    resolve('ON1=' + a + 'ms OFF=' + b + 'ms ON2=' + c + 'ms units=' + E.units.length + ' sprc=' + (window.__wbSPRC.stats ? window.__wbSPRC.stats.entries : '-'));
  })();
})" 2>&1 | tail -1

pkill -f "next dev"
echo "=== 特征色探针（probe-person-pixels 14 特征）==="
for f in all-z45 all-z75 all-z95 all-z24 all-z26; do
  OUT=$(node scripts/probe-person-pixels.mjs "/tmp/qa102/$f.png" 2>/dev/null)
  N=$(echo "$OUT" | grep -c "✓" || true)
  echo "$f: $N/14"
done
echo "DONE"