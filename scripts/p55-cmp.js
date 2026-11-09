// #55 实验三对比：读两个 trace 找首分歧 tick + 分歧页号
(function () {
  const a = JSON.parse(localStorage.getItem('p55_tr_A') || 'null');
  const b = JSON.parse(localStorage.getItem('p55_tr_B') || 'null');
  if (!a || !b) return 'MISSING TRACES';
  const out = { bMemA: a.b.mem, bMemB: b.b.mem, bEqual: a.b.mem === b.b.mem, firstDiverge: -1, pages: [], tickFp: [] };
  for (let i = 0; i < Math.min(a.tr.length, b.tr.length); i++) {
    if (a.tr[i].mem !== b.tr[i].mem) { out.firstDiverge = a.tr[i].t; for (let p = 0; p < a.tr[i].pages.length; p++) if (a.tr[i].pages[p] !== b.tr[i].pages[p]) out.pages.push(p); break; }
  }
  for (let i = 0; i < Math.min(a.tr.length, b.tr.length); i++) out.tickFp.push(a.tr[i].t + ':' + a.tr[i].mem + (a.tr[i].mem === b.tr[i].mem ? '' : '|' + b.tr[i].mem));
  return JSON.stringify(out);
})()
