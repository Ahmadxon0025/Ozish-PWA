/* Self-destroying service worker.
   Replaces the old Ozish-PWA worker that cached the calorie app at this
   origin. On activation it deletes every cache, unregisters itself, and
   reloads open tabs so the live portfolio is served from the network. */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      if (self.caches && caches.keys) {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }
      await self.registration.unregister();
      var clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (c) { c.navigate(c.url); });
    } catch (e) {}
  })());
});

/* While active, never serve from the old cache — always hit the network. */
self.addEventListener('fetch', function (event) {
  event.respondWith(
    fetch(event.request).catch(function () {
      return new Response('', { status: 504, statusText: 'offline' });
    })
  );
});
