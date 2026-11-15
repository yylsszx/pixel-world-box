#!/bin/bash
# #100 QA：A/B 像素扫描（缓存开/关全画布逐位等价）+ 2400 单位满载性能
S=task-03e363425671
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

echo "=========== A/B 像素扫描（缓存开/关逐位等价）==========="
AB=$(ab eval "
new Promise((resolve) => {
  const E = window.__wbEngine;
  E.speed = 0; E.fxPrefs.dayNight = false;
  const W = 256, H = 160;
  const okT = (t) => t === 3 || t === 4 || t === 5 || t === 2;
  let x0 = -1, y0 = -1;
  outer: for (let cy = 8; cy < H - 12; cy++) for (let cx = 8; cx < W - 26; cx++) {
    let ok = true;
    for (let y = cy; y < cy + 10 && ok; y++) for (let x = cx; x < cx + 26; x++) if (!okT(E.terrain[y * W + x])) { ok = false; break; }
    if (ok) { x0 = cx; y0 = cy; break outer; }
  }
  E.units.length = 0;
  // 特征矩阵（#99 方法论）：七杰 × 装备/状态/特质（法师帽/术士兜帽/能量盾/激光/剑/骑士盔/睡眠/巨人/侏儒/受击/染疫/低血/灰发/攻击态/哥布林/蜥蜴/五兽）
  const R = [0, 1, 2, 3, 4, 19, 20];
  const gear = [
    { hlm: 'wizard_hat' }, { hlm: 'warlock_hood' }, { arm: 'energy_shield', wep: 'laser_rifle' },
    { wep: 'sword3' }, { hlm: 'knight_helm', shd: 'iron_shield' }, { wep: 'musket', atk: 5 },
    { arm: 'armor2' }, { hlm: 'gold_crown' }, { wep: 'bow' }, { wep: 'wood_staff' },
  ];
  let n = 0;
  for (const r of R) {
    E.spawnUnit(r, x0 + 2 + (n % 12) * 2, y0 + 2 + ((n / 12) | 0) * 2, Object.assign({ job: 0, silent: true }, gear[n % gear.length]));
    n++;
  }
  E.spawnUnit(0, x0 + 4, y0 + 6, { job: 0, trait: 'giant', silent: true });
  E.spawnUnit(0, x0 + 6, y0 + 6, { job: 0, trait: 'tiny', silent: true });
  E.spawnUnit(0, x0 + 8, y0 + 6, { job: 0, silent: true, sleep: 1 });
  E.spawnUnit(1, x0 + 10, y0 + 6, { job: 0, silent: true, age: 90, maxAge: 100 });
  E.spawnUnit(0, x0 + 12, y0 + 6, { job: 0, silent: true, hurt: 18, hp: 20, maxHp: 60 });
  E.spawnUnit(2, x0 + 14, y0 + 6, { job: 0, silent: true, infected: true });
  E.spawnUnit(19, x0 + 16, y0 + 6, { job: 0, silent: true, wep: 'sword2', atk: 3 });
  E.spawnUnit(6, x0 + 20, y0 + 8, { silent: true }); E.spawnUnit(7, x0 + 22, y0 + 8, { silent: true });
  E.spawnUnit(8, x0 + 24, y0 + 8, { silent: true }); E.spawnUnit(10, x0 + 26, y0 + 8, { silent: true });
  E.zoomAnim = null;
  E.cam.zoom = 4.5;
  let k = 0;
  const step = () => {
    if (++k < 20) { requestAnimationFrame(step); return; }
    E.cam.x = x0 + 13; E.cam.y = y0 + 5;
    // 钉 frameCount：渲染确定性（相位全冻结）
    const FC = 1000;
    try { Object.defineProperty(E, 'frameCount', { get: () => FC, configurable: true }); } catch (e) { resolve('PIN-FAIL'); return; }
    const step2 = () => {
      if (++k < 26) { requestAnimationFrame(step2); return; }
      const cv = document.querySelector('main canvas');
      const a1 = cv.toDataURL('image/png');
      // 关缓存 → 等渲染帧 → 再取
      window.__wbSPRC.off = true;
      const step3 = () => {
        if (++k < 30) { requestAnimationFrame(step3); return; }
        const b1 = cv.toDataURL('image/png');
        window.__wbSPRC.off = false;
        // 再开回来验证第二轮（相位钉死后帧恒定）
        const step4 = () => {
          if (++k < 34) { requestAnimationFrame(step4); return; }
          const a2 = cv.toDataURL('image/png');
          resolve(JSON.stringify({ on1: a1.length, off: b1.length, on2: a2.length, on1_eq_off: a1 === b1, on1_eq_on2: a1 === a2 }));
        };
        requestAnimationFrame(step4);
      };
      requestAnimationFrame(step3);
    };
    requestAnimationFrame(step2);
  };
  requestAnimationFrame(step);
})" 2>&1 | tail -1)
echo "A/B: $AB"

echo "=========== 2400 单位满载性能 ==========="
# 铺场（每轮 600 单位，4 轮；先清野生预算计数器——存档世界的 698 野生占坑）
ab eval "(() => { const E = window.__wbEngine; try { E.wildCount.clear(); } catch (e) {} return 'cleared'; })()" > /dev/null 2>&1
for round in 1 2 3 4; do
  R=$(ab eval "
(() => {
  const E = window.__wbEngine;
  const W = 256, H = 160;
  const R = [0, 1, 2, 3, 19, 20, 6, 7, 8, 10, 35];
  const gear = [{}, { wep: 'sword3' }, { hlm: 'iron_helm' }, { arm: 'armor2' }, { wep: 'musket' }, { hlm: 'wizard_hat' }];
  const before = E.units.length;
  const deadline = performance.now() + 300;
  let tries = 0;
  while (E.units.length < before + 600 && performance.now() < deadline && tries < 20000) {
    tries++;
    const x = 4 + Math.random() * (W - 8), y = 4 + Math.random() * (H - 8);
    const t = E.terrain[(y | 0) * W + (x | 0)];
    if (t === 3 || t === 4 || t === 5 || t === 2 || t === 7) {
      E.spawnUnit(R[E.units.length % R.length], x, y, Object.assign({ silent: true }, gear[E.units.length % gear.length]));
    }
  }
  return 'round: units=' + E.units.length;
})()" 2>&1 | tail -1)
  echo "  $R"
done
ab eval "window.__wbEngine.speed = 1; window.__wbEngine.zoomAnim = null; window.__wbEngine.cam.zoom = 4.5; window.__wbEngine.cam.x = 128; window.__wbEngine.cam.y = 80; 'ok'" > /dev/null 2>&1
sleep 2
# 热身 2s（建栅完毕再测——首轮测量会把 559 条建栅开销算进 ON 的均值）
sleep 2
PERF=$(ab eval "
new Promise((resolve) => {
  let frames = 0; const t0 = performance.now();
  const cnt = () => { frames++; if (performance.now() - t0 < 4000) requestAnimationFrame(cnt); else {
    const onFps = frames / 4;
    window.__wbSPRC.off = true;
    let f2 = 0; const t1 = performance.now();
    const cnt2 = () => { f2++; if (performance.now() - t1 < 4000) requestAnimationFrame(cnt2); else {
      window.__wbSPRC.off = false;
      const st = window.__wbSPRC.stats;
      resolve(JSON.stringify({ units: window.__wbEngine.units.length, onFps: onFps.toFixed(1), offFps: (f2 / 4).toFixed(1), sprc: st ? { entries: st.entries, hits: st.hits, misses: st.misses } : null }));
    } };
    requestAnimationFrame(cnt2);
  } };
  requestAnimationFrame(cnt);
})" 2>&1 | tail -1)
echo "PERF: $PERF"
pkill -f "next dev"
