// ============ 界域 Artifacts（Task 55 · Claude 式可分享造物包） ============
// 统一的导出/导入信封格式：任何玩家资产（造物/插件/Mod/世界存档）都可变成一个 .json 文件带走，
// 在另一台机器的界域里复活。kind 信封让导入端自动识别内容类型。
export type ArtifactKind =
  | 'wb-plugin' // 单个神谕插件
  | 'wb-mod' // 单个世界 Mod
  | 'wb-creation' // 单个图鉴造物
  | 'wb-creations' // 图鉴全量打包
  | 'wb-world'; // 世界存档快照

export interface ArtifactEnvelope<T = unknown> {
  kind: ArtifactKind;
  /** 格式版本（向后兼容判别用） */
  v: 1;
  /** 导出时间戳 */
  exportedAt: number;
  /** 人类可读的来源标记 */
  from: string;
  payload: T;
}

/** 把任意资产打包成信封并触发浏览器下载（文件名自动带日期） */
export function downloadArtifact(kind: ArtifactKind, name: string, payload: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const env: ArtifactEnvelope = { kind, v: 1, exportedAt: Date.now(), from: '界域 Pixel World Box', payload };
    const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 48) || 'artifact';
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `${kind}_${safe}_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

/** 读取用户选择的 JSON 文件 → 信封（格式错误返回中文错误） */
export function readArtifactFile(file: File): Promise<{ ok: true; env: ArtifactEnvelope } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    if (file.size > 8 * 1024 * 1024) {
      resolve({ ok: false, error: '文件过大（>8MB）——不是界域 artifact' });
      return;
    }
    const fr = new FileReader();
    fr.onerror = () => resolve({ ok: false, error: '文件读取失败' });
    fr.onload = () => {
      try {
        const parsed = JSON.parse(String(fr.result)) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
          resolve({ ok: false, error: '不是合法 JSON' });
          return;
        }
        const r = parsed as Record<string, unknown>;
        const kind = r.kind;
        const KINDS: ArtifactKind[] = ['wb-plugin', 'wb-mod', 'wb-creation', 'wb-creations', 'wb-world'];
        if (typeof kind !== 'string' || !KINDS.includes(kind as ArtifactKind)) {
          resolve({ ok: false, error: '缺少 artifact 类型标记（不是界域导出的文件）' });
          return;
        }
        if (!('payload' in r)) {
          resolve({ ok: false, error: '缺少 payload 字段' });
          return;
        }
        resolve({ ok: true, env: parsed as ArtifactEnvelope });
      } catch {
        resolve({ ok: false, error: 'JSON 解析失败' });
      }
    };
    fr.readAsText(file);
  });
}
