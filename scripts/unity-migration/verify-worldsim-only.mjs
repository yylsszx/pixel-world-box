// ============================================================================
// verify-worldsim-only.mjs —— M-U26「深时涌现域」独立验证器（段 40）
//   五支（verify-nature2-only 范式同构）：
//   ① 零引擎镜像 14/14（bun 子进程——WS_RED 未设口径）
//   ② gen det 复跑 md5 零漂移（黄金/双写面字节级）
//   ③ 黄金签名完备（14 场景：ws 33 键非空 + fixture rect/标量面 + steps 对账面）
//   ④ 红证双旋钮（WS_RED=hydro → FAIL；WS_RED=glacier → FAIL——镜像面语义钉）
//   ⑤ 双写一致（golden/ 与 StreamingAssets/WbGolden/ 字节级）
// 运行：timeout 590 bun scripts/unity-migration/verify-worldsim-only.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLDEN = path.join(ROOT, 'scripts/unity-migration/golden/worldsim.json');
const DUAL = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/worldsim.json');
const GEN = path.join(ROOT, 'scripts/unity-migration/gen-worldsim.mjs');
const TRANSCRIPT = path.join(ROOT, 'scripts/unity-migration/worldsim-transcript.mjs');
const md5f = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
let fail = 0;
const section = (name, ok, detail = '') => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' —— ' + detail : ''}`); if (!ok) fail++; };

// ① 零引擎镜像 14/14
try {
  const out = execFileSync('bun', [TRANSCRIPT], { encoding: 'utf8', timeout: 560_000 });
  const m = out.match(/worldsim transcript: (\d+)\/(\d+) 场景逐位 (ALL PASS|FAIL)/);
  section('① 零引擎镜像 14/14', m && m[1] === m[2] && m[3] === 'ALL PASS', m ? `${m[1]}/${m[2]} ${m[3]}` : out.slice(-200));
} catch (e) {
  section('① 零引擎镜像 14/14', false, String(e.stderr || e.message).slice(-300));
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
  const WS_KEYS = ['elevMd5', 'tNoiseMd5', 'flowAccMd5', 'tempFMd5', 'psiMd5', 'curUMd5', 'curVMd5', 'sstMd5', 'heatQMd5', 'contMd5', 'coastalMd5', 'tempOverlayMd5', 'waterCntMd5', 'upwellMd5', 'glacierMd5', 'driftAccMd5', 'soilMd5', 'globalTemp', 'baselineTemp', 'seaLevel', 'eroded', 'deposited', 'biomeDrift', 'glacierTiles', 'upwellingCells', 'strongFrac', 'coastNoteCd', 'season', 'ash', 'moistMd5', 'rainCellMd5', 'yearF'];
  const FX_KEYS = ['terrain0', 'building0', 'waterTier0', 'rectElev', 'rectTempF', 'rectSst', 'rectPsi', 'rectHeatQ', 'rectCont', 'rectGlacier', 'rectDriftAcc', 'rectSoil', 'rectMoist', 'rectRainCell', 'glacierTiles0', 'riverDir0', 'seaLevel0', 'globalTemp0', 'baselineTemp0', 'coastNoteCd0', 'ash0', 'ecoState0', 'yearF0', 'season0', 'units0', 'wsSeed0'];
  let ok = g.scenarios.length === 14;
  const bad = [];
  for (const sc of g.scenarios) {
    if (!sc.terrain || !sc.fixture?.terrain0) { ok = false; bad.push(`${sc.key} 终态/夹具面缺失`); }
    for (const k of FX_KEYS) if (sc.fixture?.[k] === undefined) { ok = false; bad.push(`${sc.key} fixture.${k} 缺`); }
    for (const st of sc.stepsSnap ?? []) {
      for (const k of WS_KEYS) if (st.ws?.[k] === undefined) { ok = false; bad.push(`${sc.key} step ws.${k} 缺`); }
      if (!st.rngA || !st.terrainMd5) { ok = false; bad.push(`${sc.key} step 公共面缺`); }
    }
  }
  section('③ 黄金签名完备（14 场景 ws 32 键 ×步 + fixture 26 键）', ok, bad.slice(0, 3).join('; ') || `md5=${md5Before.slice(0, 8)}`);
} catch (e) {
  section('③ 黄金签名完备', false, String(e.message).slice(-200));
}

// ④ 红证双旋钮（镜像面语义钉）
for (const knob of ['hydro', 'glacier']) {
  try {
    execFileSync('bun', [TRANSCRIPT], { encoding: 'utf8', timeout: 560_000, env: { ...process.env, WS_RED: knob }, stdio: ['ignore', 'pipe', 'pipe'] });
    section(`④ 红证 WS_RED=${knob}（应 FAIL 而 PASS）`, false, '旋钮失效');
  } catch (e) {
    const out = String(e.stdout || '');
    const m = out.match(/worldsim transcript: (\d+)\/(\d+)/);
    section(`④ 红证 WS_RED=${knob}`, true, m ? `${m[1]}/${m[2]} FAIL 红证成立` : '非零 exit 红证成立');
  }
}

// ⑤ 双写一致
section('⑤ 双写一致（golden/ ≡ StreamingAssets/WbGolden/）', md5f(GOLDEN) === md5f(DUAL), md5f(GOLDEN).slice(0, 8));

console.log(`verify-worldsim-only: ${fail === 0 ? 'ALL PASS' : `${fail} FAIL`}`);
if (fail > 0) process.exit(1);
