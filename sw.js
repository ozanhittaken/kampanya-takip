const CACHE_NAME = 'kampanya-takip-v25';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Helper to fetch and cache bypassing browser HTTP cache
const cacheBustAsset = async (cache, asset) => {
  try {
    const separator = asset.includes('?') ? '&' : '?';
    const response = await fetch(`${asset}${separator}cb=${Date.now()}`, { cache: 'reload' });
    if (response.ok) {
      await cache.put(asset, response);
      return;
    }
  } catch (e) {
    console.warn(`Cache-busting fetch failed for ${asset}, trying fallback:`, e);
  }
  try {
    const response = await fetch(asset);
    if (response.ok) {
      await cache.put(asset, response);
    }
  } catch (err) {
    console.error(`Failed to cache asset ${asset}:`, err);
  }
};

// Install: Cache core assets in parallel
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(ASSETS.map(asset => cacheBustAsset(cache, asset))))
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Network-first strategy with same-origin filter
self.addEventListener('fetch', (event) => {
  // Only cache same-origin requests
  const isSameOrigin = event.request.url.startsWith(self.location.origin);
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache only same-origin successful responses
        if (response.ok && isSameOrigin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(event.request).then(cached => {
          // SPA navigation fallback — if no cache hit for a navigation request, serve index.html
          if (!cached && event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return cached;
        });
      })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return clients.openWindow('/');
      })
  );
});

// Listen for messages from main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = event.data;
    self.registration.showNotification(title, {
      body,
      tag,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">🏷️</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">🔔</text></svg>',
      vibrate: [200, 100, 200],
      requireInteraction: true
    });
  }
});
