// diag-cvt57c.mjs — 用导出的 runScenario 权威重放，输出各场景 civ1 存活表 + fall 事件
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return null;
    if (k === 'createImageData' || k === 'getImageData')
      return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'createPattern') return () => ({});
    return typeof k === 'string' ? noop : undefined;
  },
  set: () => true,
});
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const gen = await jiti.import(path.join(ROOT, 'scripts/unity-migration/gen-units-civtick.mjs'));

const names = ['CVT57-army-form', 'CVT58-army-levy', 'CVT59-army-muster-broke', 'CVT60-army-rally-march',
  'CVT61-army-march-siege-ambush', 'CVT62-army-siege-approach', 'CVT63-army-frontpush-march', 'CVT64-army-supply-line',
  'CVT65-army-pursue-kill', 'CVT66-army-rout-panic-disband', 'CVT67-army-triumph', 'CVT68-barracks-war',
  'CVT69-barracks-peace', 'CVT70-temple-heal', 'CVT71-front-decay', 'CVT72-front-solidify'];
for (const name of names) {
  const sc = gen.scenarios.find((s) => s.name === name);
  const r = gen.runScenario(sc);
  const t0 = r.traces[0];
  const c1 = t0.civs.find((c) => c.id === 1);
  const falls = r.traces.flatMap((t, k) => t.newEvents.filter((e) => e.kind === 'fall' || e.kind === 'colonize').map((e) => `k${k}:${e.kind}`));
  const armies = t0.armies.map((a) => `${a.name}/${a.state}/m${a.members.length}`);
  console.log(name, '| c1alive=', c1?.alive, 'houses=', c1?.houses, '| falls:', falls.join(',') || '-', '| armies:', armies.join(';') || '-');
}
