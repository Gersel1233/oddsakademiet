/* ============================================================
   Spiis Admin – service worker
   Modtager push-beskeder og åbner admin ved tryk. Ingen caching:
   admin skal ALTID køre nyeste version direkte fra nettet.
   ============================================================ */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { /* tom besked */ }
  const title = data.title || 'Spiis Admin';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Der er nyt i jeres overblik.',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    tag: data.tag || undefined,
    vibrate: [180, 60, 180],
    data: { url: '/admin.html' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.includes('/admin')) return c.focus();
    }
    return self.clients.openWindow('/admin.html');
  }));
});
