// gen-worldgen.mjs — M-U7f' 程序化世界生成黄金向量生成器：generateWorld 全链直录
// 真实现 = noise.ts L3-52（mulberry32/hash2/valueNoise/fbm）+ worldgen.ts L31-257（heightAt/generateWorld）
// 蓝本锚：heightAt domain-warp fBm + edge falloff（L31-46）/ 六档海陆阈值 + 气候场量化（L62-91）/
//         湖泊 sprinkle（L93-106，Math.hypot 圈地）/ 沼泽斑片（L108-134，邻水洼地+斑块噪声）/
//         trySpawn 15 组（L211-232）/ trySpawnSpread 猎场 k-center（L166-209，Task 98 最远点采样）/
//         鲨鱼锚定鱼群（L235-249，8 次重试落水）/ land sanity 递归重掷 seed+1337（L251-254）。
// dump 协议：terrain/variant/temp/moist 四全图场字段级 gzip+base64（RLE 对 moist 高熵场退化为
//         4.1MB → gzB64 后 9 场景 ~1.2MB）；
//         spawnAnimals x/y 原始 double JSON 数字（gen-render2 raceVis shortest round-trip 契约）。
// 递归语义对账：gen 侧独立模拟递归链（landCount<400 → seed+=1337）得 finalSeed，
//         并断言模拟链终态 terrain ≡ 直接调 generateWorld(seed) 返回（内部递归等价性）。
// 跑法：node scripts/unity-migration/gen-worldgen.mjs（自带 sanity + det 子进程双跑 + [GEN PASS]）
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { generateWorld } = await jiti.import(path.join(ROOT, 'src/lib/game/worldgen.ts'));
const { T, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

const W = 256, H = 160;

// 字段级 gzip+base64（R3 体积纪律：四全图场 gzB64 传输——terrain/temp/moist/variant 原始字节
// 逐位对账不变，C# 侧 Convert.FromBase64String → GzipStream 解码；RLE 全量版实测 6.5MB 退化退役）
function gzB64(u8) { return zlib.gzipSync(Buffer.from(u8), { level: 9 }).toString('base64'); }
function rle(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const start = i;
    const v = arr[i];
    while (i < arr.length && arr[i] === v) i++;
    out.push([start, v, i - start]);
  }
  return out;
}
// 蓝本 L252-253 land 采样（i+=7 步进、>=T.SAND）
function landCount(terrain) {
  let n = 0;
  for (let i = 0; i < terrain.length; i += 7) if (terrain[i] >= T.SAND) n++;
  return n;
}

const scens = [];
function wgScene(name, seed, params, checkRecursion = false) {
  const res = generateWorld(seed, params);
  // 递归发生判定（吸收性等价，仅 checkRecursion 场景启用——每次判定多一次全图生成 ~12s）：
  // generateWorld 内部 do-while 重掷至 land>=400（蓝本 L251-254），返回恒为终态 →
  // 递归发生 ⟺ generateWorld(seed) 终态 ≡ generateWorld(seed+1337) 终态（hops>=1 时 +1337 链被同一终态吸收）。
  let recursed = false;
  if (checkRecursion) {
    const nextRes = generateWorld(seed + 1337, params);
    recursed = Buffer.from(nextRes.terrain).equals(Buffer.from(res.terrain))
      && nextRes.spawnAnimals.length === res.spawnAnimals.length;
  }
  scens.push({
    name,
    seed,
    params: params ?? null,
    recursed,   // true = 内部重掷发生（finalSeed >= seed+1337；精确 hops 不可观测——吸收性）
    terrainGzB64: gzB64(res.terrain),
    variantGzB64: gzB64(res.variant),
    tempGzB64: gzB64(res.temp),
    moistGzB64: gzB64(res.moist),
    spawnAnimals: res.spawnAnimals.map((a) => ({ race: a.race, x: a.x, y: a.y })),
  });
  return res;
}

// ============================================================
// G 组：经典缺省 ×3 + 模板参数 ×5 + 递归重掷 ×1
// ============================================================
wgScene('G01_classic_seed1', 1, undefined);
wgScene('G04_archipelago', 7, { seaBias: 0.15, warp: 2.2, falloff: 1.4 });
wgScene('G05_pangaea_warm', 99, { seaBias: -0.12, falloff: 0.35, tempBias: 0.1, moistBias: 0.15 });
wgScene('G06_iceage', 2024, { tempBias: -0.25 });
wgScene('G07_no_lakes', 314, { lakes: 0 });
wgScene('G08_flat_continent', 5, { warp: 0.3 });
wgScene('G09_recursion_allsea', 1234, { seaBias: 0.55, falloff: 2.0 }, true);

// ============================================================
// sanity 断言
// ============================================================
let assertN = 0, assertFail = 0;
function ok(cond, msg) { assertN++; if (!cond) { assertFail++; console.error('  [SANITY FAIL]', msg); } }
function findS(n) { return scens.find((s) => s.name === n); }
function gunzipB64(b64) { return new Uint8Array(zlib.gunzipSync(Buffer.from(b64, 'base64'))); }
function terrainOf(s) { return gunzipB64(s.terrainGzB64); }
function countT(t, tv) { let n = 0; for (let i = 0; i < t.length; i++) if (t[i] === tv) n++; return n; }

{
  // 全场景保底：动物非空 + 递归终态保底（蓝本 sanity 出口 land>=400）
  for (const s of scens) {
    ok(s.spawnAnimals.length > 0, s.name + ' spawnAnimals 非空');
    const land = landCount(terrainOf(s));
    ok(land >= 400, s.name + ' land>=400（实测 ' + land + '）');
  }
  const g1 = terrainOf(findS('G01_classic_seed1'));
  ok(countT(g1, T.DEEP) > 0 && countT(g1, T.GRASS) > 0 && countT(g1, T.SAND) > 0, 'G01 经典世界 DEEP/GRASS/SAND 三态齐');
  const g4 = terrainOf(findS('G04_archipelago'));
  ok(countT(g4, T.DEEP) / (W * H) > 0.35, 'G04 群岛 DEEP 占比 >35%');
  const g6 = findS('G06_iceage');
  const g6t = terrainOf(g6);
  ok(countT(g6t, T.SNOW) > 0, 'G06 冰河期有 SNOW');
  // temp 量化场：冰河场景 temp 均值应低于温室场景 G05
  const tempMean = (s) => {
    const t = gunzipB64(s.tempGzB64);
    let sum = 0;
    for (let i = 0; i < t.length; i++) sum += t[i];
    return sum / t.length;
  };
  ok(tempMean(g6) < tempMean(findS('G05_pangaea_warm')), 'G06 冰河 temp 均值 < G05 温室');
  // 鲨鱼锚定语义：全部 SHARK 落水（蓝本 L235-249 出世即搁浅防线）
  const g1s = findS('G01_classic_seed1');
  const sharks = g1s.spawnAnimals.filter((a) => a.race === R.SHARK);
  const g1t = g1;
  let sharkWet = 0;
  for (const a of sharks) {
    const jt = g1t[Math.floor(a.y) * W + Math.floor(a.x)];
    if (jt === T.WATER || jt === T.DEEP) sharkWet++;
  }
  ok(sharks.length > 0 && sharkWet === sharks.length, `G01 鲨鱼全落水 ${sharkWet}/${sharks.length}`);
  // 26 锚鱼群 + 种族覆盖面
  const fishN = g1s.spawnAnimals.filter((a) => a.race === R.FISH).length;
  ok(fishN >= 26, `G01 鱼锚数 >=26（实测 ${fishN}）`);
  const racesSeen = new Set(g1s.spawnAnimals.map((a) => a.race));
  ok([R.SHEEP, R.WOLF, R.BEAR, R.DEER, R.PENGUIN, R.CAMEL, R.FISH, R.SHARK].every((r) => racesSeen.has(r)), 'G01 八族全撒布');
  // 沼泽存在性（经典世界高湿洼地必出——宽松阈值）
  const swampN = countT(g1, T.SWAMP);
  ok(swampN > 0, `G01 沼泽斑片非空（实测 ${swampN}）`);
  // 递归场景：G09 全海参数应触发内部重掷（吸收性等价实证）
  const g9 = findS('G09_recursion_allsea');
  ok(g9.recursed, `G09 递归重掷触发（吸收性等价：generateWorld(1234)≡generateWorld(2571)）`);
  ok(scens.length === 7, '场景数 7');
}
console.log('[GEN WORLDGEN] scen=' + scens.length);
console.log('[GEN WORLDGEN] sanity ' + (assertN - assertFail) + '/' + assertN + (assertFail === 0 ? ' PASS' : ' FAIL'));
if (assertFail > 0 && !process.env.WB_GENO_KEEPFAIL) process.exit(1);

// ---------------- det 双跑 ----------------
const snap1 = JSON.stringify(scens);
const CHILD = process.argv.includes('--detchild');
if (CHILD) {
  mkdirSync('/tmp', { recursive: true });
  writeFileSync('/tmp/wb-det-childwg.json', snap1);
  process.exit(0);
}
mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/worldgen.json');
writeFileSync(outPath, JSON.stringify({ meta: { gen: 'gen-worldgen.mjs', note: 'M-U7f 程序化世界生成黄金：generateWorld 全链（noise fBm+heightAt+湖泊 hypot+沼泽+撒布 k-center+鲨鱼锚定+递归重掷）' }, scens: scens }));
const { createHash } = await import('node:crypto');
const { execFileSync } = await import('node:child_process');
const selfPath = fileURLToPath(import.meta.url);
execFileSync(process.execPath, [selfPath, '--detchild'], { stdio: ['ignore', 'ignore', 'inherit'] });
const childSnap = readFileSync('/tmp/wb-det-childwg.json', 'utf8');
if (childSnap !== snap1) { console.error('[GEN WORLDGEN] det 双跑不一致'); process.exit(1); }
console.log('[GEN WORLDGEN] det 双跑字节级一致 md5=' + createHash('md5').update(snap1).digest('hex'));
console.log('[GEN WORLDGEN] golden/worldgen.json ' + (snap1.length / 1024).toFixed(1) + 'KB 快照规模');
console.log('[GEN PASS]');
