// ============ 存档安全层（防错误写读协议） ============
// 目标：存档「永不出错」——写入前备份旧档、写入后回读校验、配额超限自救、
// 读取时结构验证 + 损坏自动回退上一份备份。
// 设计原则：所有 localStorage 存档写入都必须经过 safePersistSlot，绝不裸 setItem。

import type { SaveData } from './types';

/** 备份键后缀（wb_save_slot_0 → wb_save_slot_0__bak） */
const BAK_SUFFIX = '__bak';

/** 配额超限错误判定（各浏览器异常形态不一） */
function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)
  );
}

/** 全部存档相关键（数据 + 元信息 + 备份），配额自救与清理用 */
const SLOT_KEYS = ['wb_save_slot_0', 'wb_save_slot_1', 'wb_save_slot_2', 'wb_save_auto', 'wb_save_v1'];
const META_KEY = 'wb_save_meta_v1';

/** 配额自救：按伤害最小序清除备份（保数据弃备份 → 最后才动旧版兼容档） */
function pruneForQuota(): void {
  // 1) 全部 .bak 备份（保底手段，丢的是二级保险）
  for (const k of SLOT_KEYS) {
    try {
      localStorage.removeItem(k + BAK_SUFFIX);
    } catch {
      /* ignore */
    }
  }
  // 2) 旧版单槽只读兼容档（最后手段：新档写不进去时旧档让位）
  try {
    localStorage.removeItem('wb_save_v1');
  } catch {
    /* ignore */
  }
}

export interface PersistResult {
  ok: boolean;
  /** 失败原因（ok=false 时必有） */
  error?: string;
  /** 本次写入是否为备份腾出了空间（配额自救触发） */
  pruned?: boolean;
}

/**
 * 安全写入：备份旧档 → 写入 → 回读校验 → 失败时自动回滚。
 * - 写入前把现有数据滚动备份到 `key__bak`（上一份完好档）
 * - 写入后立即回读比对（部分浏览器在配额临界时可能静默截断）
 * - 回读不一致 → 用备份还原键值 → 返回失败（调用方 toast）
 * - 配额超限 → 清理备份重试一次
 */
export function safePersist(key: string, json: string): PersistResult {
  if (typeof json !== 'string' || json.length === 0) return { ok: false, error: '空数据拒绝写入' };
  let old: string | null = null;
  try {
    old = localStorage.getItem(key);
  } catch {
    /* 读失败不影响写入尝试 */
  }

  const attempt = (): PersistResult => {
    try {
      localStorage.setItem(key, json);
    } catch (e) {
      if (isQuotaError(e)) return { ok: false, error: 'quota' };
      return { ok: false, error: e instanceof Error ? e.message : '浏览器存储不可用' };
    }
    // 回读校验（防静默截断 / 竞态覆写）
    let back: string | null = null;
    try {
      back = localStorage.getItem(key);
    } catch {
      /* ignore */
    }
    if (back !== json) {
      // 数据不一致：还原备份（或清掉坏档），绝不留下半截数据
      try {
        if (old !== null) localStorage.setItem(key, old);
        else localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return { ok: false, error: '写入后校验失败（数据未落盘，旧档已保留）' };
    }
    return { ok: true };
  };

  let r = attempt();
  // 配额超限 → 自救（清备份/旧档）→ 重试一次
  if (!r.ok && r.error === 'quota') {
    pruneForQuota();
    r = attempt();
    if (!r.ok && r.error === 'quota') return { ok: false, error: '浏览器存储空间已满（已自动清理备份仍不足）', pruned: true };
    return { ...r, pruned: true };
  }
  if (!r.ok) return r;

  // 写入成功 → 滚动备份上一份（只有内容变化时才备份，避免无谓翻倍占用）
  if (old !== null && old !== json) {
    try {
      localStorage.setItem(key + BAK_SUFFIX, old);
    } catch {
      // 备份写不下：非致命（主档已安全落盘），配额留给未来的正式写入
    }
  }
  return { ok: true };
}

/** 安全写元信息（轻量 JSON；失败静默——meta 只是展示层，损坏可重建） */
export function safePersistMeta(m: unknown): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* 展示层数据：忽略 */
  }
}

// ———————————————————————— 读取侧：结构验证 + 损坏回退 ————————————————————————

/** 存档结构不变量校验：返回 null = 健康；否则返回可读的损坏描述 */
export function validateSaveData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return '存档根结构损坏（非对象）';
  const d = data as Partial<SaveData>;
  if (d.v !== 1 && d.v !== 2) return `不支持的存档版本: ${String(d.v)}`;
  if (typeof d.seed !== 'number' || !Number.isFinite(d.seed)) return '种子数据损坏';
  if (typeof d.tickCount !== 'number' || !Number.isFinite(d.tickCount) || d.tickCount < 0) return '时间线数据损坏';
  if (!Array.isArray(d.civs)) return '文明数据损坏（civs 非 Array）';
  if (!Array.isArray(d.buildings)) return '建筑数据损坏（buildings 非 Array）';
  if (d.v === 2) {
    if (typeof d.terrain !== 'string' || d.terrain.length < 8) return '地形数据损坏（RLE 流过短）';
    // v2 列式单位：u = [header, ...rows]；旧 v2 档可能退回 units
    const hasRows = Array.isArray(d.u) && d.u.length > 1;
    const hasUnits = Array.isArray(d.units) && d.units.length > 0;
    if (!hasRows && !hasUnits) return '单位数据损坏（u/units 均为空）';
    if (hasRows) {
      const rows = d.u as unknown[][];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!Array.isArray(r) || typeof r[0] !== 'number' || typeof r[1] !== 'number') {
          return `单位行 ${i} 数据损坏`;
        }
      }
    }
    if (Array.isArray(d.units) && d.units.length > 0) {
      for (const u of d.units) {
        if (!u || typeof u.id !== 'number' || typeof u.race !== 'number') return '存档单位数据损坏';
      }
    }
    // dyn 段存在时必须是对象
    if (d.dyn !== undefined && (typeof d.dyn !== 'object' || !Array.isArray((d.dyn as { races?: unknown }).races))) {
      return '涌现层数据损坏（dyn.races 非 Array）';
    }
  } else {
    if (!Array.isArray(d.units)) return '单位数据损坏（units 非 Array）';
    for (const u of d.units) {
      if (!u || typeof u.id !== 'number' || typeof u.race !== 'number') return '存档单位数据损坏';
    }
  }
  // civs 行抽查（id/alive 字段）
  for (const c of d.civs as { id?: unknown }[]) {
    if (!c || typeof c.id !== 'number') return '文明行数据损坏';
  }
  return null;
}

export interface LoadSlotResult {
  ok: boolean;
  data?: SaveData;
  error?: string;
  /** 主档损坏但备份救回 */
  recovered?: boolean;
  /** 备份也被删（用户在恢复对话框里选了删除）后：调用方应刷新槽位列表 */
}

/** 安全读取槽位：主档 → 结构校验 → 损坏则尝试 __bak 回退 */
export function safeLoadSlot(key: string): LoadSlotResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { ok: false, error: '浏览器存储不可用' };
  }
  if (!raw) return { ok: false, error: '这个槽位是空的' };

  const tryParse = (text: string): { data?: SaveData; error?: string } => {
    try {
      return { data: JSON.parse(text) as SaveData };
    } catch {
      return { error: 'JSON 解析失败' };
    }
  };

  const main = tryParse(raw);
  if (main.data) {
    const vErr = validateSaveData(main.data);
    if (!vErr) return { ok: true, data: main.data };
    // 主档结构损坏 → 试备份
    const bakRaw = (() => {
      try {
        return localStorage.getItem(key + BAK_SUFFIX);
      } catch {
        return null;
      }
    })();
    if (bakRaw) {
      const bak = tryParse(bakRaw);
      const bakErr = bak.data ? validateSaveData(bak.data) : (bak.error ?? '备份不可读');
      if (!bakErr && bak.data) {
        return { ok: true, data: bak.data, recovered: true };
      }
      return { ok: false, error: `存档结构损坏（${vErr}），备份也无法恢复（${bakErr}）` };
    }
    return { ok: false, error: `存档结构损坏（${vErr}），且没有可用备份` };
  }
  // JSON 都解析不了 → 试备份
  const bakRaw2 = (() => {
    try {
      return localStorage.getItem(key + BAK_SUFFIX);
    } catch {
      return null;
    }
  })();
  if (bakRaw2) {
    const bak = tryParse(bakRaw2);
    const bakErr = bak.data ? validateSaveData(bak.data) : (bak.error ?? '备份不可读');
    if (!bakErr && bak.data) return { ok: true, data: bak.data, recovered: true };
    return { ok: false, error: `存档 JSON 已损坏，备份也无法恢复（${bakErr}）` };
  }
  return { ok: false, error: '存档 JSON 已损坏，且没有可用备份' };
}

/** 删除槽位（连同其备份与元信息） */
export function safeRemoveSlot(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key + BAK_SUFFIX);
  } catch {
    /* ignore */
  }
}
