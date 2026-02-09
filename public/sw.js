/**
 * 全球通套餐管家 - 手动 Service Worker
 * VERSION: v4.3
 */

const VERSION = 'v4.3';
const CACHE_NAME = `sim-manager-cache-${VERSION}`;

// 核心静态资源缓存列表
const PRE_CACHE_ASSETS = [
  './',
  './index.html',
  './index.css',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap'
];

// 安装阶段：强制跳过等待
self.addEventListener('install', (event) => {
  console.log(`[SW] 正在安装版本: ${VERSION}`);
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRE_CACHE_ASSETS);
    })
  );
});

// 激活阶段：清理旧缓存并立即接管所有页面
self.addEventListener('activate', (event) => {
  console.log(`[SW] 版本 ${VERSION} 已激活`);
  event.waitUntil(
    Promise.all([
      // 立即接管所有受控客户端
      self.clients.claim(),
      // 删除所有旧版本的缓存
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log(`[SW] 正在清理旧缓存: ${cacheName}`);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// 策略：网络优先 (Network First)
// 这种策略最适合工具类应用，有网时保证代码最新，没网时使用缓存离线运行
self.addEventListener('fetch', (event) => {
  // 仅处理 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 如果网络请求成功，将响应存入缓存
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // 只缓存有效的响应，不缓存第三方扩展等
          if (event.request.url.startsWith('http')) {
            cache.put(event.request, responseToCache);
          }
        });
        return response;
      })
      .catch(() => {
        // 网络失败（离线），尝试从缓存中查找
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 如果缓存也没有，对于导航请求返回 index.html 实现 SPA 路由兼容
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});