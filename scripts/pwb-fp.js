// PWB 位等 QA 指纹工具（#50 建档，#52 重写入库沉淀）：引擎全字段指纹 + 模拟哈希 + 单 eval 同步协议
// 用法：agent-browser eval "$(cat scripts/pwb-fp.js)"  —— 幂等安装 window.__PWB
(function () {
  if (window.__PWB && window.__PWB.v === 3) { console.log('[PWB] already installed v3'); return; }
  function fnv(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function ser(v, depth) {
    if (v === null) return '0';
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v) ? 'n' + v : (v > 0 ? 'nInf' : 'nNInf');
    if (t === 'boolean') return v ? 'b1' : 'b0';
    if (t === 'string') return 's' + fnv(v);
    if (t === 'undefined') return 'u';
    if (t === 'bigint') return 'i' + v;
    if (t !== 'object') return 'x'; // function/symbol
    if (ArrayBuffer.isView(v)) {
      const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      let h = 2166136261 >>> 0;
      for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
      return 'y' + v.length + ':' + ('0000000' + h.toString(16)).slice(-8);
    }
    if (v instanceof Map) {
      let s = 'm' + v.size;
      if (depth > 0) {
        const ks = [...v.keys()].sort();
        const n = Math.min(ks.length, 400);
        for (let i = 0; i < n; i++) { const k = ks[i]; s += '|' + ser(k, depth - 1) + '>' + ser(v.get(k), depth - 1); }
      }
      return s;
    }
    if (v instanceof Set) {
      let s = 't' + v.size;
      if (depth > 0) {
        const vs = [...v.values()].sort();
        const n = Math.min(vs.length, 400);
        for (let i = 0; i < n; i++) s += '|' + ser(vs[i], depth - 1);
      }
      return s;
    }
    if (Array.isArray(v)) {
      let s = 'a' + v.length;
      if (depth > 0) {
        const n = Math.min(v.length, 1200);
        for (let i = 0; i < n; i++) s += '|' + ser(v[i], depth - 1);
      }
      return s;
    }
    let s = 'o';
    if (depth > 0) {
      const ks = Object.keys(v).sort();
      const n = Math.min(ks.length, 80);
      for (let i = 0; i < n; i++) { const k = ks[i]; s += '|' + k + '>' + ser(v[k], depth - 1); }
    }
    return s;
  }
  // 模拟相关白名单（simHash 组成；视觉/性能遥测字段不入 simHash）
  const SIM_FIELDS = [
    'seed', 'tickCount', 'yearF', 'rngA', 'frameCount', 'unitSeq', 'civSeq', 'toastSeq',
    'victoryCiv', 'multiCivSeen', 'units', 'civs', 'buildings', 'items', 'rel', 'met',
    'laws', 'wildReproScale', 'grassTiles', 'ecoState', 'families', 'speciesBase',
    'dynRaces', 'enemyLut', 'emergentWeapons', 'doctrines', 'defenses', 'armies',
    'triggers', 'directives', 'warShame', 'occCiv', 'occStr', 'occSet', 'wars',
    'terrain', 'variant', 'owner', 'buildingTiles', 'fire', 'radiate', 'road',
    'riverTiles', 'worldEvents',
    'farmland', // 【机制②】垦田覆盖层入模拟白名单（耕地土地化后的核心模拟态）
  ];
  window.__PWB = {
    v: 3,
    fnv,
    /** 单字段指纹表：{字段名: digest}（全 own 属性，函数/Canvas/DOM 类自动跳过） */
    fp(e) {
      const out = {};
      const ks = Object.keys(e);
      for (const k of ks) {
        const v = e[k];
        const t = typeof v;
        if (v === null) { out[k] = 'null'; continue; }
        if (t === 'number') { out[k] = Number.isFinite(v) ? 'n' + v : 'nNaN'; continue; }
        if (t === 'boolean') { out[k] = v ? 'b1' : 'b0'; continue; }
        if (t === 'string') { out[k] = 's:' + fnv(v) + ':' + Math.min(v.length, 40); continue; }
        if (t === 'undefined') { out[k] = 'u'; continue; }
        if (t === 'function') { out[k] = 'fn'; continue; }
        if (v instanceof HTMLElement || v instanceof HTMLCanvasElement || v instanceof CanvasRenderingContext2D || v instanceof ImageBitmap) { out[k] = 'dom'; continue; }
        try { out[k] = ser(v, 3).slice(0, 4096) + '#' + fnv(ser(v, 4)); } catch (err) { out[k] = 'err:' + err.message; }
      }
      return out;
    },
    /** 模拟哈希：白名单字段的 digest 串联再 fnv（剥除视觉/遥测噪声） */
    simHash(e) {
      const fp = this.fp(e);
      let acc = '';
      for (const k of SIM_FIELDS) acc += k + '=' + (fp[k] ?? 'MISSING') + ';';
      return fnv(acc);
    },
    /** 协议跑批：loadFromSlot → N 手动 tick → {h0,h1,ticks}（单 eval 同步，rAF 不插入） */
    run(slot, ticks) {
      const st = window.__wb.store.getState();
      const e = window.__wbEngine;
      const okLoad = st.loadFromSlot(slot);
      if (!okLoad) return { error: 'load failed: ' + slot };
      const h0 = this.simHash(e);
      const t0 = performance.now();
      for (let i = 0; i < ticks; i++) e.tick();
      const t1 = performance.now();
      const h1 = this.simHash(e);
      return { h0, h1, ms: Math.round(t1 - t0), units: e.units.length, tick: e.tickCount };
    },
    /** 紧凑签名：{字段: 8hex}（localStorage 安全体积 ~4KB） */
    sig(e) {
      const f = this.fp(e);
      const out = {};
      for (const k of Object.keys(f)) out[k] = fnv(f[k]);
      return out;
    },
    /** 协议 A：load→sig/h0→N tick→h1，全存 localStorage[base+'*'] */
    runA(slot, ticks, base) {
      const st = window.__wb.store.getState();
      const e = window.__wbEngine;
      const okLoad = st.loadFromSlot(slot);
      if (!okLoad) return { error: 'load failed: ' + slot };
      const sig0 = this.sig(e);
      const h0 = this.simHash(e);
      for (let i = 0; i < ticks; i++) e.tick();
      const h1 = this.simHash(e);
      localStorage.setItem(base + 'HA', h1);
      localStorage.setItem(base + 'SIG', JSON.stringify(sig0));
      localStorage.setItem(base + 'H0', h0);
      return { h0, h1, units: e.units.length, tick: e.tickCount, stored: base };
    },
    /** 协议 B：同页跑批并与 A 对比 → {sameH, sameSig0, diffFields:[...]} */
    runB(slot, ticks, base) {
      const st = window.__wb.store.getState();
      const e = window.__wbEngine;
      const okLoad = st.loadFromSlot(slot);
      if (!okLoad) return { error: 'load failed: ' + slot };
      const sig0 = this.sig(e);
      const h0 = this.simHash(e);
      for (let i = 0; i < ticks; i++) e.tick();
      const h1 = this.simHash(e);
      const sigA = JSON.parse(localStorage.getItem(base + 'SIG') || '{}');
      const h0A = localStorage.getItem(base + 'H0'), h1A = localStorage.getItem(base + 'HA');
      const diffFields = [];
      for (const k of Object.keys(sig0)) if (sigA[k] !== undefined && sigA[k] !== sig0[k]) diffFields.push(k);
      return { sameH0: h0 === h0A, sameH: h1 === h1A, sameSig0: diffFields.length === 0, diffFields, h0, h1, h0A, h1A };
    },
    /** 载入序测试（#52 终审）：同页 N 次 load→300tick，回 {runs:[{h0,h1}]} —— 内核全局态残留诊断 */
    loadSeq(slot, ticks, n) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(this.run(slot, ticks));
      return out;
    },
  };
  console.log('[PWB] installed v3');
})();
