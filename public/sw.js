const CACHE_NAME = 'xert-build-pending';
const APP_SHELL = [
  '/manifest.json',
  '/admin-manifest.json',
  '/assets/xert-logo-icon.png',
  '/assets/xert-manifest-icon.jpg',
  '/assets/xert-icon-192.png',
  '/assets/xert-icon-512.png',
  '/assets/xert-maskable-192.png',
  '/assets/xert-maskable-512.png',
  '/assets/xert-logo-horizontal-light.png',
  '/assets/xert-logo-mark-light.png',
  '/assets/xert-logo-stacked-light.png',
];
self.__XERT_BUILD_ASSETS__ = [];
const BUILD_ASSETS = self.__XERT_BUILD_ASSETS__;

self.addEventListener('install', event => {
  // Upgrades wait for existing tabs to close so an owner session can never
  // mix an old lazy-loaded app with a new release cache.
  event.waitUntil(precacheCurrentBuild());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys()
        .then(keys => Promise.all(keys
          .filter(key => key.startsWith('xert-') && key !== CACHE_NAME)
          .map(key => caches.delete(key)))),
      self.registration.navigationPreload?.enable(),
    ])
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
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// The production build injects every emitted JavaScript and CSS URL above,
// including lazy admin workspaces that never appear directly in index.html.
async function precacheCurrentBuild() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch('/index.html', { cache: 'no-store' });
  if (!indexResponse.ok) throw new Error(`App shell returned ${indexResponse.status}`);

  const assets = [...new Set([...APP_SHELL, ...BUILD_ASSETS])];
  for (let index = 0; index < assets.length; index += 20) {
    await cache.addAll(assets.slice(index, index + 20));
  }
  await cache.put('/index.html', indexResponse);
}

async function networkFirstNavigation(event) {
  try {
    // The install step owns this release's cached HTML. Updating it from an
    // older active worker could pair a new index with uncached asset hashes.
    const response = (await event.preloadResponse) || (await fetch(event.request));
    if (response.ok) return response;
    return (await cachedIndex()) || response;
  } catch {
    return (await cachedIndex()) || (await caches.match('/'));
  }
}

async function cachedIndex() {
  const cache = await caches.open(CACHE_NAME);
  return cache.match('/index.html');
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
