// @ts-nocheck
// 神谕准确性诊断脚本：以与前端完全一致的方式调用 /api/oracle/agent
// 观察模型真实工具调用行为（原生 FC + 文本协议），输出完整轨迹
import { buildSystemPrompt, } from '../src/lib/oracle/prompt';
import { effectiveOracleTools, } from '../src/lib/oracle/plugins';
import { renderToolCatalog, buildNativeToolSchemas, } from '../src/lib/oracle/tools';

const BASE = 'http://localhost:3000';
const PROVIDER = { kind: 'builtin', label: '内置 Z.ai' };

async function callOnce(messages, tools) {
  const res = await fetch(`${BASE}/api/oracle/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: PROVIDER, messages, deep: false, tools }),
  });
  if (!res.ok || !res.body) return { content: '', err: `HTTP ${res.status}`, calls: [] };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let content = '', err = '';
  const calls = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const p = t.slice(5).trim();
      if (p === '[DONE]') continue;
      try {
        const ev = JSON.parse(p);
        if (ev.err) err = ev.err;
        if (ev.t) content += ev.t;
        if (ev.tc) {
          const d = ev.tc;
          let slot = calls.find((c) => c.index === d.index);
          if (!slot) { slot = { index: d.index, id: '', name: '', argsRaw: '' }; calls.push(slot); }
          if (d.id) slot.id = d.id;
          if (d.name) slot.name = d.name;
          if (d.argsDelta) slot.argsRaw += d.argsDelta;
        }
      } catch { /* ignore */ }
    }
  }
  return { content, err, calls };
}

const CASES = process.argv.slice(2);
const tests = CASES.length ? CASES : [
  '放一颗核弹',
  '让狼群变得凶猛三倍',
  '统计各种族的数量并给我排名',
];

const eff = effectiveOracleTools();
const sys = buildSystemPrompt(renderToolCatalog(eff));
const nativeTools = buildNativeToolSchemas(eff);
console.log(`工具总数: ${eff.length}`);

for (const q of tests) {
  console.log('\n============ 指令: ' + q + ' ============');
  const t0 = Date.now();
  const r = await callOnce(
    [{ role: 'assistant', content: sys }, { role: 'user', content: q }],
    nativeTools,
  );
  const ms = Date.now() - t0;
  console.log(`耗时 ${ms}ms | err=${r.err || '无'}`);
  if (r.calls.length) {
    for (const c of r.calls) {
      console.log(`  [原生FC] ${c.name}(${c.argsRaw})`);
    }
  } else {
    console.log('  [无原生FC调用] 文本输出前600字:');
    console.log('  ' + r.content.slice(0, 600).replace(/\n/g, '\n  '));
  }
}
