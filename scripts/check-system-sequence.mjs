#!/usr/bin/env node
// ============ S-A 系统时序对账守护 ============
// 比对 src/lib/game/systemSequence.ts 的 SYSTEM_REGISTRY 与 engine.ts tick() 方法体：
// ① 方法调用序一致 ② 每条目的 every/offset 一致。任何 tick 改动未同步 registry 都会在此拦截。
// 用法：node scripts/check-system-sequence.mjs   （exit 0 = 对账通过）
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const engSrc = readFileSync(ROOT + 'src/lib/game/engine.ts', 'utf8');
const regSrc = readFileSync(ROOT + 'src/lib/game/systemSequence.ts', 'utf8');

// —— 1. 提取 tick() 方法体 ——
const lines = engSrc.split('\n');
const start = lines.findIndex((l) => /^  tick\(\) \{$/.test(l));
if (start < 0) { console.error('FATAL: tick() not found'); process.exit(2); }
let end = -1;
for (let i = start + 1; i < lines.length; i++) {
  if (/^  \}$/.test(lines[i])) { end = i; break; }
}
if (end < 0) { console.error('FATAL: tick() end not found'); process.exit(2); }
const body = lines.slice(start, end + 1);

// —— 2. 从方法体提取 (调用名, every, offset) 序列 ——
const CALL = /((?:this\.)?[A-Za-z_][A-Za-z0-9_]*|(?:nature|worldsim)\.[A-Za-z_][A-Za-z0-9_]*|agentLaws\.tick)\(\)/g;
const WHITELIST = ['sampleHistory', 'checkTriggers', 'seasonCheck', 'rebuildCivBuildCounts', 'rebuildBuckets'];
const isSysCall = (n) => {
  const bare = n.replace(/^this\./, '');
  if (bare === 'WBB.touchMeta' || bare === 'touchMeta') return false;
  if (bare === 'tick') return false; // tick() 方法签名本身非子系统
  const tail = bare.split('.').pop();
  return /(Tick|tick)$/.test(tail) || WHITELIST.includes(tail) || bare === 'agentLaws.tick';
};
const sched = [];
for (const line of body) {
  let every = 1, offset = 0;
  const cond = line.match(/tickCount\s*%\s*(\([^)]*\)|[^=\s][^=]*?)\s*===\s*(\d+)/);
  if (cond) {
    let ev = cond[1].trim();
    if (ev.startsWith('(')) { // 三元调度（lichRaiseTick: season===3 ? 8 : 12）→ 括号内末个数字 = 常态周期
      const nums = ev.match(/\d+/g);
      ev = nums[nums.length - 1];
    }
    every = Number(ev);
    offset = Number(cond[2]);
  } else if (line.includes('tickCount') || line.includes('%')) continue; // 携带 tickCount 但非调度行（防御）
  const names = [...line.matchAll(CALL)].map((m) => m[1].replace(/^this\./, '')).filter(isSysCall);
  for (const n of names) sched.push({ name: n, every, offset });
}

// —— 3. 从 registry 提取非内联条目 ——
const reg = [];
for (const line of regSrc.split('\n')) {
  if (!/name: '/.test(line) || /inline: true/.test(line)) continue;
  const m = line.match(/name: '([^']+)', every: (\d+), offset: (\d+)/);
  if (!m) continue; // GROUP_META 等非条目行（无 every/offset 完整模式）静默跳过
  reg.push({ name: m[1], every: Number(m[2]), offset: Number(m[3]) });
}

// —— 4. 对账 ——
let fail = 0;
if (sched.length !== reg.length) {
  console.error(`✗ 条目数不一致：tick() 方法调用 ${sched.length} vs registry ${reg.length}`);
  fail++;
}
const n = Math.min(sched.length, reg.length);
for (let i = 0; i < n; i++) {
  const a = sched[i], b = reg[i];
  if (a.name !== b.name || a.every !== b.every || a.offset !== b.offset) {
    console.error(`✗ #${i + 1} 漂移：tick()=${a.name}(${a.every}/${a.offset}) vs registry=${b.name}(${b.every}/${b.offset})`);
    fail++;
  }
}
if (fail === 0) {
  console.log(`✓ S-A 对账通过：${sched.length} 条子系统调用序与 SYSTEM_REGISTRY 完全一致（every/offset 逐条吻合）`);
} else {
  console.error(`✗ ${fail} 处漂移 —— tick() 改动未同步 systemSequence.ts`);
  process.exit(1);
}
