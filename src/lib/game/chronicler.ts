// ============ 编年史官（Worker /api/chronicle 前端接线，v2.0 唯一未接线端点收口） ============
// 触发方式：纯用户按需点击（世界纪事面板「史官」按钮）——零定时器零自动轮询，
//   任何时刻都不后台自发请求（用户指令铁律：编年史不触发定时任务）。
// 通道：resolveCloudBackend（用户显式中继 > 官方云端中继多镜像竞速）；
//   provider：用户已配 openai/anthropic（带 Key）则透传厂商，否则 builtin
//   （官方 Worker 的 Workers AI llama-3.1-8b 零配置免费——开箱即云端真 AI 史官）。
// 降级：云端不可达 / 超时 / 非 200 / 空稿 → 本地离线简史（纯确定性模板，零网络零随机）
//   ——史官永不当机；降级缘由写入 note 由 UI 呈现（不静默假装云端成稿）。
import { resolveCloudBackend } from '@/lib/oracle/direct-client';
import { loadStoredProvider } from '@/lib/oracle/provider-store';
import type { WorldEvent } from './types';

export interface ChronicleResult {
  /** 编年史正文（云端 120-240 字叙事，或本地简史） */
  text: string;
  via: 'cloud' | 'local';
  /** 降级缘由 / 提示（本地简史时说明为何没走云端） */
  note?: string;
}

/** Worker 契约：/api/chronicle 入参 events 上限 48 条（validateChronicleInput CHRON_EVENTS_MAX） */
const CHRON_EVENTS_MAX = 48;

/** 本地离线简史：按年份归并纪事（确定性——零随机零网络；每年至多两句，简史取其要） */
export function localChronicleText(events: WorldEvent[]): string {
  const chrono = events.slice(0, CHRON_EVENTS_MAX).reverse(); // 事件流新→旧，翻为旧→新
  if (chrono.length === 0) return '这片世界的历史尚未开始书写——建国、战争、天灾与传奇都将铭刻于此。';
  const years = new Map<number, string[]>();
  for (const ev of chrono) {
    const list = years.get(ev.year) ?? [];
    if (list.length < 2) list.push(ev.text);
    years.set(ev.year, list);
  }
  const parts: string[] = [];
  for (const [year, texts] of years) parts.push(`第${year}年，${texts.join('；')}。`);
  return parts.join('').slice(0, 320);
}

/** 递交近期纪事，生成编年史叙事（永不 throw）。用户点击时调用——按需触发。 */
export async function composeChronicle(events: WorldEvent[]): Promise<ChronicleResult> {
  const apiEvents = events
    .slice(0, CHRON_EVENTS_MAX)
    .reverse()
    .map((e) => ({ year: e.year, type: String(e.kind), text: e.text }));
  if (apiEvents.length === 0) {
    return { text: localChronicleText(events), via: 'local', note: '尚无纪事可撰——世界的历史尚未开始' };
  }

  // provider 选择：已配云厂商（带 Key）透传；否则 builtin（官方 Workers AI 零配置免费）
  let provider: { kind: string; baseUrl?: string; apiKey?: string; model?: string } = { kind: 'builtin' };
  try {
    const p = loadStoredProvider();
    if ((p.kind === 'openai' || p.kind === 'anthropic') && p.apiKey?.trim()) {
      provider = { kind: p.kind, baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model };
    }
  } catch {
    /* provider-store 不可用（隐私模式等）→ builtin */
  }

  let base: string | null = null;
  try {
    base = await resolveCloudBackend();
  } catch {
    base = null;
  }
  if (!base) {
    return {
      text: localChronicleText(events),
      via: 'local',
      note: '云端史官不可达（大陆线路对 workers.dev 常不稳——绑定自定义域名可根治：设置→厂商接入→测试连接旁指引）',
    };
  }
  try {
    const res = await fetch(`${base}/api/chronicle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, civName: '像素世界', events: apiEvents }),
      signal: AbortSignal.timeout(26_000), // Worker 侧上游超时 20s + 余量
    });
    if (res.ok) {
      const j = (await res.json()) as { chronicle?: unknown };
      if (typeof j.chronicle === 'string' && j.chronicle.trim()) {
        return { text: j.chronicle.trim(), via: 'cloud' };
      }
    }
    return { text: localChronicleText(events), via: 'local', note: '云端史官未成稿——已用本地简史代笔' };
  } catch {
    return { text: localChronicleText(events), via: 'local', note: '云端史官超时/不可达——已用本地简史代笔' };
  }
}
