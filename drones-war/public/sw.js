// Service worker that makes Spartans V1 installable as an app. The game is online-only, so it always
// tries the network first (players get updates as soon as they are deployed) and only falls back to
// the cached copy when offline, so the app still opens and can show its menus.
const CACHE = 'drones-war-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only same-origin GETs; never touch the WebSocket, the health check or other sites.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/health') return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: url.pathname === '/' });
      if (hit) return hit;
      throw err;
    }
  })());
});
