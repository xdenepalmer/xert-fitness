const CACHE_NAME = 'xert-runtime-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/xert-logo-icon.png',
  '/assets/xert-logo-horizontal-light.png',
  '/assets/xert-logo-mark-light.png',
  '/assets/xert-logo-stacked-light.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('xert-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    return (await caches.match('/index.html')) || (await caches.match('/'));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(response => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || network;
}
