// ============ 神谕 provider 配置 · 共享存取（议会/中枢/神谕面板同一份配置） ============
// 此前 PROVIDER_STORE_KEY 与 loadProvider 私有于 OraclePanel——议会(council)想走用户配置只能重复实现。
// 抽出共享模块：面板读写、引擎侧只读，单一事实源（localStorage 'oracle-provider-v1'）。
import type { OracleProviderConfig, ProviderKind } from './types';

export const PROVIDER_STORE_KEY = 'oracle-provider-v1';

export const DEFAULT_PROVIDER: OracleProviderConfig = { kind: 'builtin', label: '内置 Z.ai' };

/** 从 localStorage 恢复 provider 配置（防御式：坏 JSON / 非法 kind / 非 DOM 环境一律回默认） */
export function loadStoredProvider(): OracleProviderConfig {
  try {
    const raw = globalThis.localStorage?.getItem(PROVIDER_STORE_KEY);
    if (!raw) return DEFAULT_PROVIDER;
    const p = JSON.parse(raw) as OracleProviderConfig;
    if (p && (p.kind === 'builtin' || p.kind === 'openai' || p.kind === 'anthropic' || p.kind === 'gemini' || p.kind === 'local')) {
      return {
        kind: p.kind as ProviderKind,
        label: p.label,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        model: p.model,
        temperature: p.temperature,
        forceCpu: p.forceCpu,
        relayUrl: p.relayUrl,
      };
    }
  } catch {
    /* 坏存档回默认 */
  }
  return DEFAULT_PROVIDER;
}
