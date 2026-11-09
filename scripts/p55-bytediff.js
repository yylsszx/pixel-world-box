// #55：page58 字节级 diff（tick19 应全等、tick20 找分歧字节）
(function () {
  const a = JSON.parse(localStorage.getItem('p55_t2_A') || 'null');
  const b = JSON.parse(localStorage.getItem('p55_t2_B') || 'null');
  if (!a || !b) return 'MISSING';
  function de64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  const out = {};
  for (const t of ['t19', 't20']) {
    const ua = de64(a.caps[t] || ''), ub = de64(b.caps[t] || '');
    const diffs = [];
    for (let i = 0; i < Math.min(ua.length, ub.length); i++) if (ua[i] !== ub[i]) diffs.push(i);
    // 合并成连续段
    const segs = [];
    for (const d of diffs) { if (segs.length && d - segs[segs.length - 1][1] <= 8) segs[segs.length - 1][1] = d; else segs.push([d, d]); }
    out[t] = { nDiffs: diffs.length, segs: segs.slice(0, 30).map(s => [s[0], s[1], Array.from(ua.slice(s[0], s[1] + 1)).slice(0, 8), Array.from(ub.slice(s[0], s[1] + 1)).slice(0, 8)]) };
  }
  return JSON.stringify(out);
})()
