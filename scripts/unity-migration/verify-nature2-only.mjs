// ============================================================================
// verify-nature2-only.mjs —— M-U18「大气风暴域」独立验证器（段 41）
//   四支（M-U17 verify-nature-only 范式同构）：
//   ① 零引擎镜像 15/15（bun 子进程——N2_RED 未设口径）
//   ② gen det 复跑 md5 零漂移（黄金/双写面字节级）
//   ③ 黄金签名完备（15 场景：掷数锚 + 终态 terrain md5 + nat 42 键非空 + steps 对账面）
//   ④ 红证双旋钮（N2_RED=atm → FAIL；N2_RED=storm → FAIL——镜像面语义钉）
//   ⑤ 双写一致（golden/ 与 StreamingAssets/WbGolden/ 字节级）
// 运行：timeout 590 bun scripts/unity-migration/verify-nature2-only.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLDEN = path.join(ROOT, 'scripts/unity-migration/golden/nature2.json');
const DUAL = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/nature2.json');
const GEN = path.join(ROOT, 'scripts/unity-migration/gen-nature2.mjs');
const TRANSCRIPT = path.join(ROOT, 'scripts/unity-migration/nature2-transcript.mjs');
const md5f = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
let fail = 0;
const section = (name, ok, detail = '') => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' —— ' + detail : ''}`); if (!ok) fail++; };

// ① 零引擎镜像 15/15
try {
  const out = execFileSync('bun', [TRANSCRIPT], { encoding: 'utf8', timeout: 560_000 });
  const m = out.match(/nature2 transcript: (\d+)\/(\d+) 场景逐位 (ALL PASS|FAIL)/);
  section('① 零引擎镜像 15/15', m && m[1] === m[2] && m[3] === 'ALL PASS', m ? `${m[1]}/${m[2]} ${m[3]}` : out.slice(-200));
} catch (e) {
  section('① 零引擎镜像 15/15', false, String(e.stderr || e.message).slice(-300));
}

// ② gen det 复跑 md5 零漂移
const md5Before = md5f(GOLDEN);
try {
  execFileSync('bun', [GEN], { encoding: 'utf8', timeout: 560_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const md5After = md5f(GOLDEN);
  section('② gen det 复跑 md5 零漂移', md5Before === md5After, `${md5Before.slice(0, 8)} → ${md5After.slice(0, 8)}`);
} catch (e) {
  section('② gen det 复跑 md5 零漂移', false, String(e.stderr || e.message).slice(-300));
}

// ③ 黄金签名完备
try {
  const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const EXPECT_DRAWS = { 'atm-off': 0, 'evap-adv-ash': 3, 'oroflood': 115, 'fire-probe': 114, 'bolt-day': 320, 'bolt-winter': 1663, 'sky-family': 245, 'pressure-cycle': 60, 'storm-cyclone': 26, 'storm-blizzard': 318, 'blizzard-spawn': 190, 'storm-ravage': 85, 'drought-sand': 278, 'hydro-rivers': 8, 'bolt-gate-off': 55 };
  const keys = ['plateN', 'plateMd5', 'plateC', 'drift', 'boundaryN', 'boundaryMd5', 'stressMd5', 'hotspots', 'moistMd5', 'ashFMd5', 'ash', 'rainCellMd5', 'counters', 'recentQuakes', 'lastSeason', 'epoch', 'yearF', 'stormSeq', 'windPhase', 'floodAccMd5', 'prevRainMd5', 'boltCool', 'boltChron', 'tSnowChron', 'lightningN', 'rainbowX', 'rainbowY', 'rainbowTTL', 'rainbowCool', 'rainbowMoon', 'rainbowChron', 'moonChron', 'meteorX', 'meteorY', 'meteorDx', 'meteorDy', 'meteorTTL', 'meteorCool', 'meteorsN', 'meteorChron', 'pSys', 'stormR', 'sstMd5'];
  let ok = g.scenarios.length === 15;
  const bad = [];
  for (const sc of g.scenarios) {
    if (EXPECT_DRAWS[sc.key] !== undefined && sc.totalDraws !== EXPECT_DRAWS[sc.key]) { ok = false; bad.push(`${sc.key} draws ${sc.totalDraws}≠${EXPECT_DRAWS[sc.key]}`); }
    if (!sc.terrain || !sc.fixture?.terrain0) { ok = false; bad.push(`${sc.key} 终态/夹具面缺失`); }
    for (const k of keys) if (sc.nat?.[k] === undefined) { ok = false; bad.push(`${sc.key} nat.${k} 缺`); }
    for (const st of sc.stepsSnap) for (const k of keys) if (st.nat?.[k] === undefined) { ok = false; bad.push(`${sc.key} step nat.${k} 缺`); }
  }
  section('③ 黄金签名完备（15 场景掷数锚 + nat 43 键 ×步）', ok, bad.slice(0, 3).join('; ') || `md5=${md5Before.slice(0, 8)}`);
} catch (e) {
  section('③ 黄金签名完备', false, String(e.message).slice(-200));
}

// ④ 红证双旋钮（镜像面语义钉）
for (const knob of ['atm', 'storm']) {
  try {
    execFileSync('bun', [TRANSCRIPT], { encoding: 'utf8', timeout: 560_000, env: { ...process.env, N2_RED: knob }, stdio: ['ignore', 'pipe', 'pipe'] });
    section(`④ 红证 N2_RED=${knob}（应 FAIL 而 PASS）`, false, '旋钮失效');
  } catch (e) {
    const out = String(e.stdout || '');
    const m = out.match(/nature2 transcript: (\d+)\/(\d+)/);
    section(`④ 红证 N2_RED=${knob}`, true, m ? `${m[1]}/${m[2]} FAIL 红证成立` : '非零 exit 红证成立');
  }
}

// ⑤ 双写一致
section('⑤ 双写一致（golden/ ≡ StreamingAssets/WbGolden/）', md5f(GOLDEN) === md5f(DUAL), md5f(GOLDEN).slice(0, 8));

console.log(`verify-nature2-only: ${fail === 0 ? 'ALL PASS' : `${fail} FAIL`}`);
if (fail > 0) process.exit(1);
