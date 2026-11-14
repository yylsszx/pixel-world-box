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

// ============ 云端后端覆写（v9：直连失败兜底与 CORS 白名单厂商的转发地址，全局配置） ============

export const CLOUD_BACKEND_KEY = 'oracle-cloud-backend-v1';

/** localStorage 安全读（隐私模式/非浏览器环境降级为空） */
function safeGet(key: string): string {
  try {
    const v = globalThis.localStorage?.getItem(key);
    if (v !== null && v !== undefined) return v;
  } catch {
    /* 读取失败 → 空 */
  }
  return '';
}

function safeSet(key: string, v: string): void {
  try {
    globalThis.localStorage?.setItem(key, v);
  } catch {
    /* 写入失败（配额/隐私模式）→ 静默 */
  }
}

/** 云端后端覆写读取（空串 = 未覆写，自动路由：同源优先 → 官方 workers.dev Worker） */
export function loadCloudBackendOverride(): string {
  return safeGet(CLOUD_BACKEND_KEY).trim();
}

/** 云端后端覆写写入（空串清除覆写） */
export function storeCloudBackendOverride(url: string): void {
  safeSet(CLOUD_BACKEND_KEY, url);
}
