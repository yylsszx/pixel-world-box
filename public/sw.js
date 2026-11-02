// ============ Service Worker：离线缓存模型文件与静态资源 ============
// 缓存策略：
// - transformers.js 库文件：Cache First（长期缓存，版本固定）
// - 模型文件：Cache First（下载一次永久缓存，~300-500MB）
// - 页面/HTML：Network First（在线时获取最新，离线回退缓存）

const CACHE_NAME = 'pwb-local-model-v1';
const TRANSFORMERS_JS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
const MODEL_BASE_URL = 'https://huggingface.co/Xenova/qwen2.5-0.5b-instruct/resolve/main';

// 预缓存的静态资源
const PRECACHE_URLS = [
  '/',
  '/test-local-provider.html',
  TRANSFORMERS_JS_URL,
];

// 安装：预缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 预缓存静态资源...');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求：Cache First 策略（优先缓存，回退网络）
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  // transformers.js 库文件
  if (url.href.startsWith(TRANSFORMERS_JS_URL)) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // 模型文件（Hugging Face CDN）
  if (url.href.startsWith(MODEL_BASE_URL)) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // 同源资源：Network First（在线优先，离线回退）
  if (url.origin === location.origin) {
    event.respondWith(networkFirst(event.request, CACHE_NAME));
    return;
  }
});

/** Cache First：先查缓存，命中则返回，否则请求网络并缓存 */
async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // 离线且无缓存：返回友好错误页面
    return new Response('离线且无缓存，请联网后重试', { status: 503 });
  }
}

/** Network First：先请求网络，成功则缓存并返回，失败则回退缓存 */
async function networkFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // 离线且无缓存：返回离线页面
    if (request.mode === 'navigate') {
      const offline = await cache.match('/');
      if (offline) return offline;
    }
    return new Response('离线且无缓存', { status: 503 });
  }
}

// 消息通信：支持客户端手动触发缓存清理/预热
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
  if (event.data?.type === 'PRECACHE_MODEL') {
    const modelUrl = event.data.url || MODEL_BASE_URL;
    caches.open(CACHE_NAME).then((cache) => {
      // 这里只是标记，实际下载由浏览器自然触发
      event.ports[0]?.postMessage({ ok: true, message: '模型缓存已就绪，首次使用时自动下载' });
    });
  }
});