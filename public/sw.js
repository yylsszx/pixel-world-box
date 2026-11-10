// ============================================================
// Pixel World Box · Service Worker v1（Task 79 首载优化）
// ------------------------------------------------------------
// 目标：首次加载约 2.7MB JS（引擎 1.85MB + 框架 0.8MB）之后，
//      二次访问**秒开**且**离线可玩**（纯前端游戏天然全缓存可玩）。
//
// 策略（自洽性推演）：
//   · _next/static/*（chunk 文件名带内容 hash）→ cache-first。
//     hash 即版本：新部署 = 新 URL = 缓存自然 miss 回源，永不陈旧。
//   · wasm/、logo.svg、字体等不可变资产 → cache-first 同上。
//   · HTML（导航请求）→ network-first：每次先拿最新 HTML，
//     新 HTML 引用新 hash chunk 自动接力缓存；断网才回退缓存页。
//     —— 这条是防「缓存旧 HTML 引用已清理 chunk → 404 白屏」的关键。
//   · /api/* 神谕请求 → 永不缓存（平台内网能力，静态托管 404 降级已有）。
//   · activate 时清掉非当前版本命名空间的旧缓存桶，防积累。
// ============================================================
const VER = 'pwb-v1';

self.addEventListener('install', () => {
  // 不预缓存清单：chunk 名带 hash 无法预知，全部运行时渐进缓存
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== VER).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 只管同源

  // —— HTML / 导航：network-first（断网回退缓存页）——
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VER).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error()))
    );
    return;
  }

  // —— 神谕 API：直连不缓存 ——
  if (url.pathname.includes('/api/')) return;

  // —— 不可变静态资产：cache-first ——
  const immutable =
    url.pathname.includes('/_next/static/') ||
    url.pathname.includes('/wasm/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.css');
  if (immutable) {
    event.respondWith(
      caches.open(VER).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
});
