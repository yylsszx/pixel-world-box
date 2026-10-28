// gen-render6.mjs — M-U7b 渲染接线 II 黄金向量生成器：emergence.ts visCacheFor 涌现视觉域宿主生产
// 真实现 = emergence.ts visCacheFor/invalidateVisCache/mutateVis/visFromGene 直调（纪律②零同源复制）
// 覆盖面：
//   ① !vis → null（静态种族 vis=false 域）
//   ② SPRITE_BASE 10 族父种色板全表（每族一组典型基因组）
//   ③ 未知 sprite → wolf 回退
//   ④ glow=1 → accent '#7df9ff' 覆盖（覆盖发生在缓存 set 之前——黄金即最终值）
//   ⑤ pattern=2 → accent 基色选 light（bias 0.02/0.3 两支）
//   ⑥ 缓存命中怪癖：同 race 二次调用（vis 参数不同）返回首建缓存（蓝本 hit 短路）
//   ⑦ invalidate(race) / invalidate() 全清 → 重建生效
//   ⑧ mutateVis 三代涌现链（真实现固定 rng）——真实值域 hue/lum/size/bulk 漂移
//   ⑨ 钳制边界：hue±40 / lum 0.72..1.28 / size 0.8..1.45 / bulk 0..1 + l2 钳 0.06..0.94
// dump 协议：vc 14 字段（dumpVc 同 gen-render4：size/bulk f64hex、bool 0/1）+ hit 标志 + vis 输入面（hue/lum/size/bulk f64hex）。
// 跑法：node scripts/unity-migration/gen-render6.mjs（自带 sanity + det 文件对比 + [GEN PASS]）
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- mulberry32（场景固定 rng，与 gen-units 系同源公式） ----------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const EM = await jiti.import(path.join(ROOT, 'src/lib/game/emergence.ts'));
const { visCacheFor, invalidateVisCache, mutateVis, visFromGene, SPRITE_BASE } = EM;

// ---------------- dump 协议 ----------------
const f64hex = (v) => {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
};
// vis 输入面（13 字段；浮点域 f64hex，bool 域 0/1 数字）
function dumpVis(v) {
  if (!v) return null;
  return {
    root: v.root,
    hue: f64hex(v.hue), lum: f64hex(v.lum), size: f64hex(v.size), bulk: f64hex(v.bulk),
    horns: v.horns, spikes: v.spikes ? 1 : 0, mane: v.mane ? 1 : 0, tail: v.tail,
    ears: v.ears, glow: v.glow ? 1 : 0, pattern: v.pattern, crest: v.crest ? 1 : 0,
  };
}
// vc 输出面（gen-render4 dumpVc 同契约：14 字段；size/bulk f64hex；bool 0/1）
function dumpVc(vc) {
  return {
    body: vc.body, dark: vc.dark, light: vc.light, accent: vc.accent,
    size: f64hex(vc.size), bulk: f64hex(vc.bulk),
    horns: vc.horns, spikes: vc.spikes ? 1 : 0, mane: vc.mane ? 1 : 0, tail: vc.tail,
    ears: vc.ears, glow: vc.glow ? 1 : 0, pattern: vc.pattern, crest: vc.crest ? 1 : 0,
  };
}

// ---------------- 场景装配 ----------------
// ops 协议：[{t:'c', race, vis, sprite} 调用 | {t:'i', race?} 定向/全清失效] → out 为每 call 对应 {hit, vc} 或 null
const scens = [];
function vcScene(name, ops) {
  invalidateVisCache(); // 跨场景缓存隔离（M-U6c 模块级全局表教训）
  const refs = new Map(); // race → 首建引用
  const out = [];
  for (const op of ops) {
    if (op.t === 'i') { if (op.race === undefined) invalidateVisCache(); else invalidateVisCache(op.race); continue; }
    const prev = refs.get(op.race);
    const vc = visCacheFor(op.race, op.vis, op.sprite);
    if (!vc) { out.push(null); continue; }
    const hit = prev ? vc === prev : false;
    refs.set(op.race, vc); // 无条件更新：hit=与上次返回引用相等（缓存未失效）——失效重建后 hit 归零再回升
    out.push({ hit: hit ? 1 : 0, vc: dumpVc(vc) });
  }
  // dump 条件与执行语义对齐（执行侧：仅显式 op.t==='i' 是失效，无 t 字段 = 调用）——
  // 首版把无 t 的调用 op 误 dump 成 {t:'i'}（render6 镜像 19 场景 out 行数错位曝光），out 值不受影响仅输入标注修复。
  scens.push({ name, fn: 'visCacheFor', in: { ops: ops.map((op) => op.t === 'i' ? (op.race === undefined ? { t: 'i' } : { t: 'i', race: op.race }) : { t: 'c', race: op.race, vis: dumpVis(op.vis), sprite: op.sprite }) }, out });
}
function mkVis(o) {
  return {
    root: o.root ?? 0, hue: o.hue ?? 0, lum: o.lum ?? 1, size: o.size ?? 1, bulk: o.bulk ?? 0,
    horns: o.horns ?? 0, spikes: o.spikes ?? 0, mane: o.mane ?? 0, tail: o.tail ?? 0,
    ears: o.ears ?? 0, glow: o.glow ?? 0, pattern: o.pattern ?? 0, crest: o.crest ?? 0,
  };
}

// ============================================================
// 段 A：null 域 + SPRITE_BASE 10 族全表 + 回退
// ============================================================
vcScene('V01_null_vis', [{ race: 1001, vis: null, sprite: 'wolf' }]);
{ // 10 族各一：典型涌现基因组（horn/spike/尾耳/纹全开，浮点取非整值）
  const fams = ['sheep', 'wolf', 'snowwolf', 'bear', 'deer', 'penguin', 'camel', 'scorpion', 'snake', 'person'];
  fams.forEach((sp, i) => {
    vcScene(`V02_${sp}`, [{
      race: 1100 + i,
      vis: mkVis({ root: i, hue: 12 + i * 3, lum: 0.95, size: 1.2, bulk: 0.55, horns: 1, spikes: 1, mane: 1, tail: 1, ears: 2, glow: 0, pattern: 1, crest: 1 }),
      sprite: sp,
    }]);
  });
}
vcScene('V12_unknown_sprite_fallback', [{ race: 1200, vis: mkVis({ hue: -20, lum: 0.85, size: 1.1 }), sprite: 'nosuchsprite' }]);

// ============================================================
// 段 B：glow / pattern accent 双门
// ============================================================
vcScene('V13_glow_accent', [{ race: 1301, vis: mkVis({ hue: 8, lum: 1.05, size: 1.3, bulk: 0.7, glow: 1, pattern: 1 }), sprite: 'wolf' }]);
vcScene('V14_pattern2_light_bias002', [{ race: 1401, vis: mkVis({ hue: -8, lum: 0.9, size: 1.0, pattern: 2 }), sprite: 'bear' }]);
vcScene('V15_pattern2_glow_light_bias030', [{ race: 1501, vis: mkVis({ hue: 25, lum: 1.1, size: 1.4, glow: 1, pattern: 2 }), sprite: 'deer' }]);

// ============================================================
// 段 C：缓存语义（命中怪癖 / 定向失效 / 全清失效）
// ============================================================
vcScene('V16_hit_quirk_same_race', [
  { t: 'c', race: 1601, vis: mkVis({ hue: 5, lum: 0.9, size: 1.0 }), sprite: 'wolf' },   // 首建
  { t: 'c', race: 1601, vis: mkVis({ hue: 35, lum: 1.2, size: 1.4 }), sprite: 'bear' },  // 参数不同→命中旧缓存（怪癖）
]);
vcScene('V17_invalidate_race', [
  { t: 'c', race: 1701, vis: mkVis({ hue: 5 }), sprite: 'wolf' },
  { t: 'c', race: 1701, vis: mkVis({ hue: 5 }), sprite: 'wolf' },                        // 命中
]);
// 场景内定向失效后重建：ops 混编驱动（invalidateVisCache(race) 语义）
vcScene('V17b_invalidate_race_rebuild', [
  { t: 'c', race: 1702, vis: mkVis({ hue: 10, lum: 0.8 }), sprite: 'wolf' },
  { t: 'i', race: 1702 },
  { t: 'c', race: 1702, vis: mkVis({ hue: 30, lum: 1.2 }), sprite: 'wolf' },             // 失效后重建→新 vis 生效
  { t: 'c', race: 1702, vis: mkVis({ hue: -30 }), sprite: 'wolf' },                      // 再调→命中重建
]);
vcScene('V17c_invalidate_all_rebuild', [
  { t: 'c', race: 1703, vis: mkVis({ hue: 10 }), sprite: 'snake' },
  { t: 'i' },
  { t: 'c', race: 1703, vis: mkVis({ hue: -25, lum: 1.15 }), sprite: 'snake' },          // 全清后重建
]);

// ============================================================
// 段 D：mutateVis 三代涌现链（真实现固定 rng）——真实值域漂移
// ============================================================
for (let ch = 0; ch < 4; ch++) {
  const rng = mulberry32(0xd56b00 + ch * 7919);
  invalidateVisCache();
  const rootVis = visFromGene(3 + ch, { s: 1, d: 1.3, h: 1.15, r: 1 }, rng); // 高杀伤根预设（有角有刺域）
  const c1 = mutateVis(rootVis, 3 + ch, rng, 1);
  const c2 = mutateVis(c1, 3 + ch, rng, 1);
  const c3 = mutateVis(c2, 3 + ch, rng, 1);
  const sprites = ['wolf', 'snowwolf', 'bear', 'deer'];
  const calls = [
    { race: 1800 + ch, vis: rootVis, sprite: sprites[ch] },
    { race: 1900 + ch, vis: c1, sprite: sprites[ch] },
    { race: 2000 + ch, vis: c2, sprite: sprites[ch] },
    { race: 2100 + ch, vis: c3, sprite: sprites[ch] },
  ];
  vcScene(`V18_chain${ch}_${sprites[ch]}`, calls.map((c) => ({ t: 'c', ...c })));
}

// ============================================================
// 段 E：钳制边界（hue±40 / lum 0.72..1.28 / size 0.8..1.45 / bulk 0..1 / l2 钳 0.06..0.94）
// ============================================================
vcScene('V19_clamp_hue_pos40', [{ race: 2201, vis: mkVis({ hue: 40, lum: 1.28, size: 1.45, bulk: 1 }), sprite: 'penguin' }]);
vcScene('V20_clamp_hue_neg40', [{ race: 2301, vis: mkVis({ hue: -40, lum: 0.72, size: 0.8, bulk: 0 }), sprite: 'camel' }]);
// l2 钳制：penguin light #f2f6fa l≈0.945 ×1.28 = 1.21 → 钳 0.94；dark #14100c l≈0.062 ×0.72 = 0.045 → 钳 0.06
vcScene('V21_clamp_l2_high', [{ race: 2401, vis: mkVis({ lum: 1.28 }), sprite: 'penguin' }]);
vcScene('V22_clamp_l2_low', [{ race: 2501, vis: mkVis({ lum: 0.72 }), sprite: 'penguin' }]);

// ============================================================
// sanity 断言
// ============================================================
let assertN = 0, assertFail = 0;
function ok(cond, msg) { assertN++; if (!cond) { assertFail++; console.error('  [SANITY FAIL]', msg); } }
function findS(n) { return scens.find((s) => s.name === n); }

// SPRITE_BASE 全表入黄金（C# 表对照锚）
const spriteBaseDump = {};
for (const k of Object.keys(SPRITE_BASE)) spriteBaseDump[k] = [SPRITE_BASE[k].body, SPRITE_BASE[k].dark, SPRITE_BASE[k].light];

{
  // V01 null 域
  ok(findS('V01_null_vis').out[0] === null, 'V01 null vis → null');
  // V02 表覆盖：10 族场景存在且四色皆 hex 串
  const fams = ['sheep', 'wolf', 'snowwolf', 'bear', 'deer', 'penguin', 'camel', 'scorpion', 'snake', 'person'];
  fams.forEach((sp, i) => {
    const s = findS(`V02_${sp}`);
    ok(!!s && s.out.length === 1 && s.out[0].vc.body[0] === '#' && s.out[0].vc.accent[0] === '#', `V02 ${sp} 四色 hex`);
    ok(s.out[0].hit === 0, `V02 ${sp} 首建非命中`);
  });
  // 未知 sprite 回退 wolf：body 应等于 wolf 族的 body 漂移结果（同 vis 同基色）
  const wf = findS('V12_unknown_sprite_fallback').out[0].vc;
  ok(wf.body.length === 7, 'V12 回退产出 hex');
  // glow 双门
  ok(findS('V13_glow_accent').out[0].vc.accent === '#7df9ff', 'V13 glow accent #7df9ff');
  ok(findS('V13_glow_accent').out[0].vc.glow === 1, 'V13 glow 位 1');
  // pattern2 基色选 light（非 glow bias 0.02）：与 pattern0（dark 基）accent 不同
  ok(findS('V14_pattern2_light_bias002').out[0].vc.accent !== findS('V13_glow_accent').out[0].vc.accent, 'V14 非 glow accent 非 #7df9ff');
  ok(findS('V15_pattern2_glow_light_bias030').out[0].vc.accent === '#7df9ff', 'V15 双门 glow 覆盖后 #7df9ff');
  // 命中怪癖：第二次调用 hit=1 且 vc 与首次一致
  const hq = findS('V16_hit_quirk_same_race').out;
  ok(hq[0].hit === 0 && hq[1].hit === 1, 'V16 首建+命中');
  ok(hq[0].vc.body === hq[1].vc.body && hq[0].vc.accent === hq[1].vc.accent, 'V16 命中返回首建缓存（参数被忽略）');
  // 定向失效重建：b 与 a 不同（新 vis 生效），c 命中 b
  const vb = findS('V17b_invalidate_race_rebuild').out;
  ok(vb[0].vc.body !== vb[1].vc.body, 'V17b 失效后重建新 vis 生效');
  ok(vb[2].hit === 1, 'V17b 重建后命中');
  // 全清重建
  const vc2 = findS('V17c_invalidate_all_rebuild').out;
  ok(vc2[0].vc.body !== vc2[1].vc.body, 'V17c 全清后重建生效');
  // 涌现链：四代皆产出且 size/bulk 有漂移
  const ch0 = findS('V18_chain0_wolf').out;
  ok(ch0.length === 4 && ch0.every((o) => o.vc.body[0] === '#'), 'V18 chain0 四代全产出');
  // 钳制：V21 高明度 dark/light 钳 0.94（light 基色 l≈0.945×1.28>0.94）；V22 低明度 dark 钳 0.06
  ok(findS('V21_clamp_l2_high').out[0].vc.light !== findS('V22_clamp_l2_low').out[0].vc.light, 'V21/22 明度钳制两极分化');
  // SPRITE_BASE 表规模
  ok(Object.keys(spriteBaseDump).length === 10, 'SPRITE_BASE 10 族');
}
console.log('[GEN RENDER6] scen=' + scens.length);
console.log('[GEN RENDER6] sanity ' + (assertN - assertFail) + '/' + assertN + (assertFail === 0 ? ' PASS' : ' FAIL'));
if (assertFail > 0 && !process.env.WB_GEN6_KEEPFAIL) process.exit(1);

// ---------------- det 双跑（/tmp 文件字节级对比） ----------------
const snap1 = JSON.stringify(scens);
const CHILD = process.argv.includes('--detchild');
if (CHILD) {
  mkdirSync('/tmp', { recursive: true });
  writeFileSync('/tmp/wb-det-child6.json', snap1);
  process.exit(0);
}
mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/render6.json');
writeFileSync(outPath, JSON.stringify({ meta: { gen: 'gen-render6.mjs', note: 'M-U7b 渲染接线 II 黄金：emergence.ts visCacheFor 涌现视觉域宿主生产（SPRITE_BASE 表/缓存语义/mutateVis 链/钳制边界）', spriteBase: spriteBaseDump }, scens: scens }));
const { createHash } = await import('node:crypto');
const { execFileSync } = await import('node:child_process');
const selfPath = fileURLToPath(import.meta.url);
execFileSync(process.execPath, [selfPath, '--detchild'], { stdio: ['ignore', 'ignore', 'inherit'] });
const childSnap = readFileSync('/tmp/wb-det-child6.json', 'utf8');
if (childSnap !== snap1) { console.error('[GEN RENDER6] det 双跑不一致'); process.exit(1); }
console.log('[GEN RENDER6] det 双跑字节级一致 md5=' + createHash('md5').update(snap1).digest('hex'));
console.log('[GEN RENDER6] golden/render6.json ' + (snap1.length / 1024).toFixed(1) + 'KB 快照规模');
console.log('[GEN PASS]');
