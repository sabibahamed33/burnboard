// BURNBOARD Service Worker — Production PWA (No Firebase)
//
// Cache discipline (privacy-first):
//   - Static app shell + icons: cache-first.
//   - Navigations: network-first, but ONLY '/' and '/offline' HTML is ever
//     stored. All other pages fall back to /offline without being cached, so
//     account-specific pages (/messages, /notifications, profiles) can never
//     leak across accounts on a shared device.
//   - API routes, Supabase, and signed-URL media are NEVER cached.
//   - Old versioned caches are purged on activate (stale-asset recovery).
const CACHE_VERSION = 'v4';
const STATIC_CACHE = `burnboard-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `burnboard-dynamic-${CACHE_VERSION}`;

// Assets to pre-cache on install (all must exist or install still succeeds).
const PRE_CACHE_URLS = [
  '/',
  '/offline',
  '/icon.svg',
  '/icon-192.png',
];

// Navigations safe to store for offline use (public shell only).
const OFFLINE_CACHEABLE_PATHS = new Set(['/', '/offline']);

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRE_CACHE_URLS))
      .catch(() => {})
  );
  self.skipWaiting();
});

// ── Activate (purge everything from older versions) ──────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Controlled update (client asks us to take over now) ───────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function hasSignedQuery(url) {
  const q = url.search || '';
  return q.includes('signature=') || q.includes('token=') || q.includes('X-Amz-Signature');
}

// ── Fetch Strategy ───────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // NEVER cache: API routes, Supabase/upstream backends, signed media.
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('upstash')) return;
  if (hasSignedQuery(url)) return;

  // Skip chrome-extension and other non-http schemes
  if (!url.protocol.startsWith('http')) return;

  // Strategy: Network-first for HTML, Cache-first for static assets
  if (request.mode === 'navigate') {
    // Network-first for navigation
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Store ONLY the public shell — never account-specific pages.
          if (response && response.status === 200 && OFFLINE_CACHEABLE_PATHS.has(url.pathname)) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match('/offline');
          });
        })
    );
  } else if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.avif') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  ) {
    // Cache-first for static assets
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  } else {
    // Stale-while-revalidate for other same-origin GETs (public images etc.)
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && url.origin === self.location.origin) {
              const clone = response.clone();
              caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
  }
});

// ── Push Notifications ───────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New burn dropped! 🔥',
      icon: '/icon-192.png',
      badge: '/icon.svg',
      vibrate: [100, 50, 100],
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: 'View Burn', icon: '/icon.svg' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'BURNBOARD 🔥', options)
    );
  } catch (err) {
    console.warn('[SW] Push parse error:', err);
  }
});

// ── Notification Click ───────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});
