// ============ 云端存档同步（v2.0「后端全家桶」前端半件） ============
// 设计：
//   · 后端 = PWB Cloudflare Worker 的 /api/save/*（KV 持久层，免费配额即限流）；
//   · 鉴权 = 备份码（本设备生成 96bit 熵随机码，云端以码代身份——无账号体系的轻量方案）；
//   · 通道决策 = resolveCloudBackend（用户显式中继 > 官方中继）——与神谕路由单一事实源；
//   · 序列化 = 引擎 serialize('manual') 纯拷贝（与导出文件同源）；恢复 = importSave 同一校验链
//     （validateSaveData → applySave → reset council），云恢复走 new File 构造复用全链，零旁路。
//   · 永不 throw——错误折进 err 字符串（UI toast 呈现）。
import { resolveCloudBackend } from '@/lib/oracle/direct-client';

const DEVICE_CODE_KEY = 'pwb-cloud-code';
const CODE_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export interface CloudSaveMeta {
  slot: number;
  name: string;
  savedAt: number;
  size: number;
}

export interface CloudSyncResult<T> {
  ok: boolean;
  data?: T;
  err?: string;
}

/** 取（或首次生成）本设备的云端备份码：pwb- + 24 位随机小写十六进制（96bit 熵，不可猜测） */
export function getDeviceCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(DEVICE_CODE_KEY);
    if (existing && /^pwb-[a-z0-9]{16,32}$/.test(existing)) return existing;
  } catch {
    /* localStorage 不可用（隐私模式）→ 用内存态退路（本次会话内可用） */
  }
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let code = 'pwb-';
  for (let i = 0; i < 24; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  try {
    window.localStorage.setItem(DEVICE_CODE_KEY, code);
  } catch {
    /* 内存退路：本次会话内保持一致 */
    (window as unknown as Record<string, unknown>).__pwbCloudCode = code;
  }
  return code;
}

/** 手动设置备份码（换设备恢复场景：输入原设备的备份码即可拉回云端存档） */
export function setDeviceCode(code: string): boolean {
  const trimmed = code.trim().toLowerCase();
  if (!/^pwb-[a-z0-9]{16,32}$/.test(trimmed)) return false;
  try {
    window.localStorage.setItem(DEVICE_CODE_KEY, trimmed);
    return true;
  } catch {
    (window as unknown as Record<string, unknown>).__pwbCloudCode = trimmed;
    return true;
  }
}

/** 云后端是否可达且带存档能力（打开存档对话框时的 UI 显隐依据） */
export async function cloudSyncAvailable(): Promise<boolean> {
  const base = await resolveCloudBackend();
  return base !== null;
}

async function saveFetch(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const base = await resolveCloudBackend();
  if (!base) throw new Error('云后端不可达（中继未配置且官方云端中继探测失败——大陆网络对 workers.dev 常不稳）');
  const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(30_000) });
  let body: Record<string, unknown> = {};
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* 空响应体 */ }
  return { status: res.status, body };
}

/**
 * 云端备份当前世界。
 * @param payload 引擎 serialize('manual') 的 JSON 字符串（调用方生成——保持 cloudSync 与引擎解耦）
 * @param name 备份显示名（如「纪元 87 年 · 4 王国」）
 * @param slot 云端槽位 0-99（UI 默认轮换 0-9）
 */
export async function cloudBackup(payload: string, name: string, slot = 0): Promise<CloudSyncResult<null>> {
  const device = getDeviceCode();
  if (!device) return { ok: false, err: '备份码生成失败（浏览器存储不可用）' };
  try {
    const { status, body } = await saveFetch('/api/save/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, slot, name, payload }),
    });
    if (status === 200) return { ok: true };
    const err = typeof body.error === 'string' ? body.error : `云端备份失败（HTTP ${status}）`;
    return { ok: false, err };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : '云端备份失败' };
  }
}

/** 云端存档清单 */
export async function cloudList(): Promise<CloudSyncResult<CloudSaveMeta[]>> {
  const device = getDeviceCode();
  if (!device) return { ok: false, err: '备份码生成失败（浏览器存储不可用）' };
  try {
    const { status, body } = await saveFetch(`/api/save/list?device=${encodeURIComponent(device)}`);
    if (status === 200) {
      const slots = Array.isArray(body.slots) ? (body.slots as CloudSaveMeta[]) : [];
      return { ok: true, data: slots };
    }
    return { ok: false, err: typeof body.error === 'string' ? body.error : `云端清单失败（HTTP ${status}）` };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : '云端清单失败' };
  }
}

/** 读取云端存档 payload（恢复前拉取；返回原始 JSON 字符串，走 importSave 全校验链） */
export async function cloudGet(slot: number): Promise<CloudSyncResult<string>> {
  const device = getDeviceCode();
  if (!device) return { ok: false, err: '备份码生成失败（浏览器存储不可用）' };
  try {
    const { status, body } = await saveFetch(`/api/save/get?device=${encodeURIComponent(device)}&slot=${slot}`);
    if (status === 200 && typeof body.payload === 'string') return { ok: true, data: body.payload };
    if (status === 404) return { ok: false, err: '该云端槽位没有存档' };
    return { ok: false, err: typeof body.error === 'string' ? body.error : `云端读取失败（HTTP ${status}）` };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : '云端读取失败' };
  }
}

/** 删除云端存档 */
export async function cloudDelete(slot: number): Promise<CloudSyncResult<null>> {
  const device = getDeviceCode();
  if (!device) return { ok: false, err: '备份码生成失败（浏览器存储不可用）' };
  try {
    const { status, body } = await saveFetch('/api/save/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, slot }),
    });
    if (status === 200) return { ok: true };
    return { ok: false, err: typeof body.error === 'string' ? body.error : `云端删除失败（HTTP ${status}）` };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : '云端删除失败' };
  }
}

/** 把云端存档字符串转为 File（复用 store.importSave 的完整校验/恢复链，零旁路） */
export function cloudPayloadToFile(payload: string): File {
  return new File([payload], 'pwb-cloud-save.json', { type: 'application/json' });
}
