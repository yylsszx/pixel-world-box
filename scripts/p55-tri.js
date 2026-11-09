// #55 回归：跨速度三角侧协议（side1 手动 / side2 20× / side3 1×，补齐至 target）
// 用法：window.__p55tri(side, target) —— side1 立即跑完；side2/3 需真跑窗口后补齐
(function () {
  const P = window.__PWB;
  const e = window.__wbEngine;
  const st = window.__wb.store.getState();
  const WBB = window.__wbBatchCore;
  if (!P || !e || !st || !WBB) return 'TOOLING MISSING';
  function memH() {
    const b = new Uint8Array(WBB.ex.memory.buffer); let h = 2166136261 >>> 0;
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function setFp(e) {
    const rows = [];
    for (const u of e.units) {
      rows.push(u.id + '|' + Math.round(u.x * 16) + '|' + Math.round(u.y * 16) + '|' + Math.round(u.hp * 64) + '|' + Math.round(u.age) + '|' + u.civId + '|' + u.race + '|' + Math.round(u.food ?? 0));
    }
    rows.sort();
    let acc = '';
    for (let i = 0; i < rows.length; i++) acc += rows[i] + ';';
    return P.fnv(acc);
  }
  window.__p55triRun = function (side) {
    const ok = st.loadFromSlot('slot2');
    const r = { ok, side, t0: e.tickCount };
    for (let i = 0; i < 240; i++) e.tick();
    e.speed = 0;
    r.t1 = e.tickCount;
    r.n = e.units.length;
    r.mem = memH();
    r.h = P.simHash(e);
    r.setFp = setFp(e);
    localStorage.setItem('p55_tri_' + side, JSON.stringify({ n: r.n, mem: r.mem, h: r.h, setFp: r.setFp, t1: r.t1 }));
    return JSON.stringify(r);
  };
  window.__p55triPrime = function (side, speed, ms) {
    const ok = st.loadFromSlot('slot2');
    e.speed = speed;
    return JSON.stringify({ ok, side, speed, note: 'free-run ' + ms + 'ms then __p55triFill(' + side + ',' + speed + ')' });
  };
  window.__p55triFill = function (side, target) {
    e.speed = 0;
    let guard = 0;
    while (e.tickCount < target && guard++ < 2000) e.tick();
    const P2 = window.__PWB;
    const r = { side, t1: e.tickCount, n: e.units.length, mem: memH(), h: P2.simHash(e), setFp: setFp(e) };
    localStorage.setItem('p55_tri_' + side, JSON.stringify({ n: r.n, mem: r.mem, h: r.h, setFp: r.setFp, t1: r.t1 }));
    return JSON.stringify(r);
  };
  window.__p55triCmp = function () {
    const a = JSON.parse(localStorage.getItem('p55_tri_1') || 'null');
    const b = JSON.parse(localStorage.getItem('p55_tri_2') || 'null');
    const c = JSON.parse(localStorage.getItem('p55_tri_3') || 'null');
    if (!a || !b || !c) return 'MISSING SIDES';
    const eq = (x, y, k) => x[k] === y[k];
    return JSON.stringify({
      n: [a.n, b.n, c.n], nEq: eq(a, b, 'n') && eq(b, c, 'n'),
      mem: [a.mem, b.mem, c.mem], memEq: eq(a, b, 'mem') && eq(b, c, 'mem'),
      h: [a.h, b.h, c.h], hEq: eq(a, b, 'h') && eq(b, c, 'h'),
      setFp: [a.setFp, b.setFp, c.setFp], setEq: eq(a, b, 'setFp') && eq(b, c, 'setFp'),
      t1: [a.t1, b.t1, c.t1],
    });
  };
  return 'p55tri installed';
})()
