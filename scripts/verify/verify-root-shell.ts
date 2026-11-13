// ROOT 根壳沙箱验证（假引擎 + 真 store）：注入环境 / 拒绝清单 / 日志采集 / 界面遥控
import './dom-stub';
const { runRootScript, runExt } = await import('../../src/lib/oracle/bridge-ext');
const { executeOracleToolAsync, executeOracleTool } = await import('../../src/lib/oracle/bridge');
const { useGameStore } = await import('../../src/store/gameStore');
const { tierOfTool } = await import('../../src/lib/oracle/permissions');
import type { GameEngine } from '../../src/lib/game/engine';

// —— 假引擎（只带根壳/界面遥控会触碰的字段） ——
const eng = {
  cam: { x: 100, y: 80, zoom: 4.5 },
  units: [
    { id: 1, dead: false, hp: 10, maxHp: 20, x: 5, y: 5, race: 0, civ: -1, name: '甲', kills: 0, trait: null, job: null, fam: null },
    { id: 2, dead: false, hp: 15, maxHp: 30, x: 6, y: 6, race: 0, civ: -1, name: '乙', kills: 0, trait: null, job: null, fam: null },
  ],
  civs: [{ id: 0, alive: true, name: '测试王国', pop: 10, kingName: 'K' }],
  terrain: new Uint8Array(256 * 160),
  owner: new Int16Array(256 * 160),
  yearF: 42.7,
  setTerrain(i: number, v: number) { eng.terrain[i] = v; },
} as unknown as GameEngine;

console.log('S1 引入完成');
let pass = 0, fail = 0;
const t = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.log('✗ FAIL: ' + name)); };

// —— ① 根壳正常执行：读引擎 + log 采集 + 返回值 ——
const r1 = await runRootScript(eng, { code: 'const alive = engine.units.filter(u => !u.dead).length; log("存活单位", alive); return { alive, year: Math.round(engine.yearF) };' });
t('根壳执行成功', r1.ok === true);
console.log('S2 根壳执行', r1.ok, JSON.stringify(r1).slice(0,120));
const d1 = r1.data as { result: { alive: number; year: number }; logs: string[] };
t('根壳读引擎数据', d1.result.alive === 2 && d1.result.year === 43);
t('根壳 log 采集', d1.logs.length > 0 && d1.logs[0].includes('存活单位'));

// —— ② 根壳写引擎：真实改地形 ——
const before = eng.terrain[100 * 256 + 100];
const r2 = await runRootScript(eng, { code: 'engine.setTerrain(100 * 256 + 100, T.LAVA); return engine.terrain[100 * 256 + 100];' });
t('根壳改写地形', r2.ok && (r2.data as { result: number }).result !== before);

// —— ③ 根壳批手术：全体单位回满血 ——
const r3 = await runRootScript(eng, { code: 'let n = 0; for (const u of engine.units) { if (!u.dead) { u.hp = u.maxHp; n++; } } return { healed: n };' });
t('根壳批手术', r3.ok && (r3.data as { result: { healed: number } }).result.healed === 2);
t('批手术真生效', (eng.units[0] as { hp: number }).hp === 20);

// —— ④ 拒绝清单 ——
for (const [label, code] of [
  ['fetch', 'fetch("https://evil.example")'],
  ['localStorage', 'localStorage.getItem("x")'],
  ['eval', 'eval("1+1")'],
  ['while(true)', 'while (true) { 1 }'],
  ['for(;;)', 'for(;;) {}'],
  ['setTimeout', 'setTimeout(() => 1, 100)'],
  ['document', 'document.cookie'],
] as const) {
  const r = await runRootScript(eng, { code });
  t(`根壳拒绝 ${label}`, r.ok === false && !!r.error?.includes('禁用'));
}

// —— ⑤ 空代码 / 超长代码 / 运行时错误 ——
t('根壳拒空代码', (await runRootScript(eng, { code: '' })).ok === false);
const r6 = await runRootScript(eng, { code: '/*' + 'x'.repeat(17000) + '*/' });
t('根壳拒超长代码', r6.ok === false && r6.error!.includes('过长'));
const r9 = await runRootScript(eng, { code: 'return engine.units.find(u => u.nope.deep);' });
t('根壳运行时错误结构化回传', r9.ok === false && !!r9.error?.includes('脚本错误'));

// —— ⑥ executeOracleToolAsync 路由 + 同步版不受影响 ——
const r7 = await executeOracleToolAsync(eng, 'run_script', { code: 'return 6 * 7;' });
t('异步执行器路由 run_script', r7.ok && (r7.data as { result: number }).result === 42);
const r8 = await executeOracleToolAsync(eng, 'get_stats', {});
t('异步执行器未知引擎字段防御', r8.ok === true || r8.ok === false); // 假引擎 get_stats 字段不全——不 throw 即可
const r8b = executeOracleTool(eng, 'get_tile', { x: 1, y: 1 });
t('同步执行器永不 throw（假引擎缺字段 → 结构化错误回执）', r8b.ok === false && typeof r8b.error === 'string');

// —— ⑦ ui_control / get_ui_state（真 zustand store） ——
const ui = runExt(eng, 'get_ui_state', {}) as Record<string, unknown>;
t('get_ui_state 返回界面态+权限快照', ui.perm != null && ui.speed != null && (ui.panels as Record<string, boolean>).kingdoms === false);
const open = runExt(eng, 'ui_control', { action: 'panel', panel: 'kingdoms', mode: 'open' }) as Record<string, unknown>;
t('ui_control 打开王国榜', open.open === true);
const st1 = useGameStore.getState();
t('面板开关真落 store', st1.showKingdoms === true);
const close = runExt(eng, 'ui_control', { action: 'panel', panel: 'kingdoms', mode: 'close' }) as Record<string, unknown>;
t('ui_control 关闭王国榜', close.open === false && useGameStore.getState().showKingdoms === false);
const spd = runExt(eng, 'ui_control', { action: 'set_speed', speed: 5 }) as Record<string, unknown>;
t('ui_control 调速', spd.speed === 5 && useGameStore.getState().speed === 5);
const badPanel = (() => { try { runExt(eng, 'ui_control', { action: 'panel', panel: 'nope' }); return false; } catch { return true; } })();
t('ui_control 未知面板报错', badPanel);
const toast = runExt(eng, 'ui_control', { action: 'toast', text: '神谕测试', tone: 'war' }) as Record<string, unknown>;
t('ui_control 推浮层', toast.toast === '神谕测试' && useGameStore.getState().toasts.length > 0);
const undo = (() => { try { runExt(eng, 'undo_world', {}); return false; } catch (e) { return (e as Error).message.includes('撤销栈为空'); } })();
t('undo_world 空栈给中文引导', undo);
const audit = runExt(eng, 'get_audit_log', { limit: 5 }) as Record<string, unknown>;
t('get_audit_log 结构', Array.isArray(audit.entries));

// —— ⑧ 审计流 + 审批队列（agent 闸门的两翼） ——
useGameStore.getState().pushOracleAudit({ name: 'divine_power', tier: 'write', ok: true, verdict: 'ok', brief: 'nuke' });
useGameStore.getState().pushOracleAudit({ name: 'run_script', tier: tierOfTool('run_script'), ok: false, verdict: 'deny', brief: '权限不足' });
t('审计流推入', useGameStore.getState().oracleAudit.length === 2);
const p = useGameStore.getState().requestOracleApproval('run_script', 'root', { code: 'return 1' });
t('审批请求挂起', useGameStore.getState().oracleApproval?.name === 'run_script');
useGameStore.getState().resolveOracleApproval(true);
t('审批 resolve', (await p) === true && useGameStore.getState().oracleApproval === null);
const p2 = useGameStore.getState().requestOracleApproval('run_script', 'root', { code: 'return 2' });
useGameStore.getState().setOracleAutoApprove(true);
t('免确认立即放行', (await p2) === true);
useGameStore.getState().setOracleAutoApprove(false);
const p3 = useGameStore.getState().requestOracleApproval('run_script', 'root', { code: 'return 3' });
useGameStore.getState().resolveOracleApproval(false);
t('拒绝流程', (await p3) === false);

console.log(`\n===== ROOT 根壳 + 界面遥控 + 审批审计：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
