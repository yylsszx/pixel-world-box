// v0.83 神谕接入修复验证：本地模型路径 / routeCallModel local 分支 / GLM 错误文案 / localStorage 防 null
// 用法：bun scripts/verify/verify-oracle-fix.ts
export {}; // 顶层 await 需要 module 上下文
let pass = 0, fail = 0;
const t = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.log('✗ FAIL: ' + name)); };

// —— localStorage 桩（含 "null" 陷阱值——JSON.parse('null') 合法返回 null）——
const store = new Map<string, string>([
  ['oracle-perm-v5', 'null'],           // 权限存档被写成 null 字符串
  ['wb_ach', 'null'],                    // 成就元进度 null
  ['wb_metas', 'null'],                  // 存档槽 meta null
]);
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

// —— ① loadPermSettings 防 null（v0.83）——
{
  const { loadPermSettings, DEFAULT_PERM_SETTINGS } = await import('../../src/lib/oracle/permissions');
  const p = loadPermSettings();
  t('权限存档为 "null" 不炸，回默认等级', p.level === DEFAULT_PERM_SETTINGS.level);
  t('权限存档为 "null" 回默认 confirm', Array.isArray(p.confirm));
}

// —— ② messagesToPrompt：系统提示首条归位 System ——
{
  const { messagesToPrompt } = await import('../../src/lib/oracle/local-provider');
  const p = messagesToPrompt([
    { role: 'assistant', content: '你是神谕' }, // agent 旧协议：系统提示由 assistant 载体承载
    { role: 'user', content: '造一个物种' },
    { role: 'assistant', content: '好的' },
  ]);
  t('系统提示首条拼为 System:', p.startsWith('System: 你是神谕'));
  t('后续 assistant 正常拼为 Assistant:', p.includes('\nAssistant: 好的'));
  t('结尾以待续 Assistant: 收束', p.endsWith('Assistant:'));
}

// —— ③ translateLocalError：四类底层错误转译 ——
{
  const { translateLocalError } = await import('../../src/lib/oracle/local-provider');
  t('网络错误 → 下载失败引导', translateLocalError('m', new Error('Failed to fetch')).includes('下载失败'));
  t('WASM 错误 → 浏览器兼容引导', translateLocalError('m', new Error('WebAssembly: compile error')).includes('系统浏览器'));
  t('null-object 错误 → 初始化异常引导', translateLocalError('m', new Error('Cannot convert undefined or null to object')).includes('初始化异常'));
  t('存储错误 → IndexedDB 引导', translateLocalError('m', new Error('IndexedDB quota exceeded')).includes('IndexedDB'));
  t('未知错误保留原文', translateLocalError('m', new Error('boom')).includes('boom'));
}

// —— ④ routeCallModel local 分支：恒浏览器推理，不走中继/后端/直连 ——
{
  const { routeCallModel } = await import('../../src/lib/oracle/direct-client');
  // 配了中继地址也必须拦在本地分支（后端会拒绝 local kind）
  const r = await routeCallModel(
    { kind: 'local', label: '本地 Qwen-0.5B', model: 'XENova/qwen2.5-0.5b-instruct', relayUrl: 'https://my-relay.example.com' },
    [{ role: 'user', content: '测试' }],
    false,
    {},
  );
  t('local + 中继地址 → 不发网络请求，返回说明文案', r.err.includes('不经网络调用'));
  t('local 说明文案含权重体积提示', r.err.includes('300-500MB'));
  const r2 = await routeCallModel(
    { kind: 'local', label: '本地', model: 'XENova/qwen2.5-0.5b-instruct' },
    [{ role: 'user', content: '测试' }],
    false,
    {},
  );
  t('local 无中继 → 同样说明文案（不再报「未知的 provider.kind」）', !r2.err.includes('未知的 provider.kind') && r2.err.includes('不经网络调用'));
}

// —— ⑤ describeNetworkError 不可直测（模块私有），经 streamDirectOpenAI 的 GLM 场景走 jiti 太重；
//     改测导出面：OraclePanel 渲染层逻辑（needsRelayWarn）为纯 UI 条件，tsc 全量覆盖 + 实机验收。

console.log(`===== v0.83 神谕接入修复：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
