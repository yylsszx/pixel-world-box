// 神谕 OS v5 核心逻辑验证（纯模块单测：权限闸门 / 原生FC累积器 / 旧协议解析器）
import { checkToolPerm, tierOfTool, permSnapshot, DEFAULT_PERM_SETTINGS, loadPermSettings, type PermTier, type OraclePermSettings } from '../../src/lib/oracle/permissions';
import { NativeCallAccumulator, parseNonStreamToolCalls } from '../../src/lib/oracle/native-tools';
import { extractToolCalls, stripToolBlocks } from '../../src/lib/oracle/agent';

let pass = 0, fail = 0;
const t = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.log('✗ FAIL: ' + name)); };

// —— ① 权限位阶归属 ——
t('get_tile → read', tierOfTool('get_tile') === 'read');
t('divine_power → write', tierOfTool('divine_power') === 'write');
t('create_law → mech', tierOfTool('create_law') === 'mech');
t('ui_control → ui', tierOfTool('ui_control') === 'ui');
t('run_script → root', tierOfTool('run_script') === 'root');
t('camera_control → ui', tierOfTool('camera_control') === 'ui');
t('undo_world → mech', tierOfTool('undo_world') === 'mech');
t('get_ui_state → read', tierOfTool('get_ui_state') === 'read');

// —— ② 权限闸门 ——
const L0: OraclePermSettings = { level: 0, confirm: ['root'] as PermTier[], rootAck: false };
const L2: OraclePermSettings = { level: 2, confirm: ['root'] as PermTier[], rootAck: false };
const L4: OraclePermSettings = { level: 4, confirm: ['root'] as PermTier[], rootAck: false };
const L4ack: OraclePermSettings = { level: 4, confirm: [], rootAck: true };
t('L0 读放行', checkToolPerm('get_stats', L0).allowed === true);
t('L0 写拦截', checkToolPerm('divine_power', L0).allowed === false && !!checkToolPerm('divine_power', L0).reason?.includes('权限不足'));
t('L2 机制放行', checkToolPerm('create_law', L2).allowed === true);
t('L2 界面拦截', checkToolPerm('ui_control', L2).allowed === false);
t('L4 未解锁 ROOT 拦 run_script', checkToolPerm('run_script', L4).allowed === false && checkToolPerm('run_script', L4).reason!.includes('解锁'));
t('L4 已解锁 ROOT 放行', checkToolPerm('run_script', L4ack).allowed === true);
t('L4 未解锁 ROOT 仍需确认', checkToolPerm('run_script', L4).needConfirm === false); // 未解锁阶段直接拦，不给确认
t('L4 rootAck confirm 缺省=需确认', checkToolPerm('run_script', { level: 4, confirm: ['root'] as PermTier[], rootAck: true }).needConfirm === true);
t('L1 神使可写不可机制', checkToolPerm('spawn_creatures', { level: 1, confirm: [], rootAck: false }).allowed === true && checkToolPerm('set_param', { level: 1, confirm: [], rootAck: false }).allowed === false);
t('默认设置=L4 未解锁', DEFAULT_PERM_SETTINGS.level === 4 && DEFAULT_PERM_SETTINGS.rootAck === false);
t('快照含 ROOT 未解锁说明', JSON.stringify(permSnapshot(L4)).includes('未解锁'));

// —— ③ 原生 FC 累积器（流式分片模拟：DeepSeek 风格 delta.tool_calls） ——
const acc = new NativeCallAccumulator();
acc.push([{ index: 0, id: 'call_001', type: 'function', function: { name: 'divine_power', arguments: '{"ki' } }]);
acc.push([{ index: 0, function: { arguments: 'nd":"nuke","x":10' } }]);
acc.push([{ index: 0, function: { arguments: ',"y":20}' } }]);
acc.push([{ index: 1, id: 'call_002', type: 'function', function: { name: 'get_stats', arguments: '{}' } }]);
const fin = acc.finalize();
t('累积器：两个调用', fin.length === 2);
t('累积器：id 对齐', fin[0].id === 'call_001' && fin[1].id === 'call_002');
t('累积器：arguments 拼接并解析', JSON.stringify(fin[0].args) === '{"kind":"nuke","x":10,"y":20}');
const accBad = new NativeCallAccumulator();
accBad.push([{ index: 0, id: 'c9', type: 'function', function: { name: 'x', arguments: '{"a":1,}' } }]); // 尾逗号
t('累积器：坏 JSON 尾逗号修复', (accBad.finalize()[0].args as Record<string, unknown>).a === 1);
const accRaw = new NativeCallAccumulator();
accRaw.push([{ index: 0, id: 'c8', type: 'function', function: { name: 'x', arguments: '{bad json' } }]);
const rawFin = accRaw.finalize()[0].args as Record<string, unknown>;
t('累积器：不可修复 JSON 进 _raw 保调用不丢', typeof rawFin._raw === 'string');

// —— ④ 非流式 tool_calls ——
const ns = parseNonStreamToolCalls({ tool_calls: [{ id: 'a1', type: 'function', function: { name: 'get_tile', arguments: '{"x":1,"y":2}' } }] });
t('非流式：解析成功', ns.length === 1 && ns[0].name === 'get_tile' && (ns[0].args as Record<string, unknown>).y === 2);

// —— ⑤ 旧协议解析器回归（原生不可用时的兜底） ——
const p1 = extractToolCalls('```json\n{"tool_calls":[{"id":"c1","name":"get_stats","args":{}}]}\n```');
t('旧协议：围栏块', p1.calls.length === 1 && p1.calls[0].name === 'get_stats');
const p2 = extractToolCalls('{"tool_call":{"name":"divine_power","args":{"kind":"nuke"}}}');
t('旧协议：裸单数', p2.calls.length === 1 && p2.calls[0].args.kind === 'nuke');
const p3 = extractToolCalls('{"name":"get_stats","args":{}}');
t('旧协议：裸单对象', p3.calls.length === 1);
const p4 = extractToolCalls('说明文字\n{"tool_calls":[{"id":"c1","name":"a","args":{}},{"id":"c2","name":"b","args":{"x":1}}]}');
t('旧协议：裸 tool_calls 定位+双调用', p4.calls.length === 2);
const p5 = extractToolCalls('```json\n{"tool_calls":[{"name":"get_stats","args":{,}]}\n```');
t('旧协议：坏块进 malformed', p5.calls.length === 0 && p5.malformed.length > 0);
t('旧协议：stripToolBlocks 清洗', stripToolBlocks('前文```json\n{"tool_calls":[{"name":"a","args":{}}]}\n```后文').includes('前文') && !stripToolBlocks('前文```json\n{"tool_calls":[{"name":"a","args":{}}]}\n```后文').includes('tool_calls'));

console.log(`\n===== 神谕 OS v5 核心逻辑：${pass} 通过 / ${fail} 失败 =====`);
if (fail > 0) process.exit(1);
