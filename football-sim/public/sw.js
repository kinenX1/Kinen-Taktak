// Offline support: network first for the page (so updates arrive), cache first for hashed assets.
const CACHE = 'ufs-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const hashed = url.pathname.includes('/assets/');
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (hashed) { const hit = await cache.match(req); if (hit) return hit; }
    try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
    catch { const hit = await cache.match(req); if (hit) return hit; throw new Error('offline'); }
  })());
});
